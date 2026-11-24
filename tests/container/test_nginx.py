"""Exercise the exact Nginx routing policy with an isolated loopback backend."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request


ROOT = Path(__file__).resolve().parents[2]


@unittest.skipUnless(shutil.which('nginx'), 'Requires the deployed Nginx binary')
class NginxRoutingTests(unittest.TestCase):
    def test_exact_post_routes_and_private_query_logs(self):
        seen = []

        class Backend(BaseHTTPRequestHandler):
            def handle_request(self):
                length = int(self.headers.get('Content-Length', 0))
                if length:
                    self.rfile.read(length)
                seen.append((self.command, self.path, self.headers.get('X-Undery-Client-IP')))
                self.send_response(503)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                if self.command != 'HEAD':
                    self.wfile.write(b'{"ok":false,"error":"auth_unavailable"}')

            do_GET = do_HEAD = do_POST = do_DELETE = handle_request

            def log_message(self, *_):
                pass

        backend = ThreadingHTTPServer(('127.0.0.1', 0), Backend)
        thread = threading.Thread(target=backend.serve_forever, daemon=True)
        thread.start()
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        try:
            with tempfile.TemporaryDirectory(prefix='undery-nginx-qa-') as directory:
                temporary = Path(directory)
                with socket.socket() as probe:
                    probe.bind(('127.0.0.1', 0))
                    port = probe.getsockname()[1]
                config = (ROOT / 'deploy/container-nginx.conf').read_text()
                config = config.replace('listen 8080;', f'listen 127.0.0.1:{port};')
                config = config.replace('127.0.0.1:3001', f'127.0.0.1:{backend.server_port}')
                config = config.replace('/tmp/', directory + '/')
                configuration = temporary / 'nginx.conf'
                configuration.write_text(config)
                log = temporary / 'nginx-output.log'
                with log.open('wb') as output:
                    process = subprocess.Popen(['nginx', '-c', str(configuration), '-p', directory,
                                                '-g', 'daemon off;'], stdout=output, stderr=output)
                    try:
                        for _ in range(100):
                            if process.poll() is not None:
                                self.fail('Isolated Nginx failed to start: ' + log.read_text())
                            try:
                                with socket.create_connection(('127.0.0.1', port), timeout=0.1):
                                    break
                            except OSError:
                                time.sleep(0.05)
                        else:
                            self.fail('Isolated Nginx did not bind')

                        def read(path, method, data=None):
                            request = urllib.request.Request(f'http://127.0.0.1:{port}' + path,
                                method=method, data=data, headers={'X-Undery-Client-IP': '192.0.2.55'})
                            try:
                                response = opener.open(request, timeout=5)
                            except urllib.error.HTTPError as error:
                                response = error
                            with response:
                                response.read()
                                return response.status, response.headers

                        allowed = ('/api/auth/github', '/api/auth/logout', '/admin/messages/entries')
                        for path in allowed:
                            status, headers = read(path + '?private-query-marker=1', 'POST')
                            self.assertEqual(status, 503, path)
                            self.assertIn('no-store', ','.join(headers.get_all('Cache-Control', [])))
                            self.assertIn('no-referrer', ','.join(headers.get_all('Referrer-Policy', [])))
                            self.assertEqual(seen[-1][2], '192.0.2.55')
                        large = b'x' * (1024 * 1024 + 1)
                        self.assertEqual(read('/api/vrchat/media?private-query-marker=4', 'POST', large)[0], 503)
                        self.assertEqual(read('/api/auth/github', 'POST', large)[0], 413)
                        self.assertEqual(read('/vrchat/admin?private-query-marker=5', 'GET')[0], 503)
                        self.assertEqual(read('/api/vrchat/media/files/test/original', 'HEAD')[0], 503)
                        self.assertEqual(read('/api/vrchat/media?id=sunset', 'DELETE')[0], 503)
                        self.assertEqual(read('/api/vrchat/media/', 'DELETE')[0], 405)
                        allowed_count = len(seen)
                        for path in ('/', '/birthday/memo/submit', '/birthday/memo/prepare',
                                     '/api/auth/github/callback', '/api/auth/github/extra',
                                     '/api/auth/github/', '/admin/messages/entries/extra',
                                     '/vrchat/admin', '/api/vrchat/media/', '/api/vrchat/media/files/test/original'):
                            self.assertEqual(read(path + '?private-query-marker=denied' if path.startswith(('/api/auth/', '/birthday/memo/')) else path, 'POST')[0], 405, path)
                        for method in ('PUT', 'PATCH', 'DELETE', 'OPTIONS'):
                            self.assertEqual(read('/api/auth/github', method)[0], 405)
                        self.assertEqual(len(seen), allowed_count)
                        self.assertEqual(read('/birthday/memo?private-query-marker=retired', 'GET')[0], 404)
                        self.assertEqual(read('/api/auth/github/callback?private-query-marker=2', 'GET')[0], 503)
                        self.assertEqual(read('/api/vrchat/birthday/feed?private-query-marker=3', 'HEAD')[0], 503)
                    finally:
                        process.terminate()
                        process.wait(timeout=10)
                self.assertNotIn('private-query-marker', log.read_text())
        finally:
            backend.shutdown()
            backend.server_close()
            thread.join(timeout=5)


if __name__ == '__main__':
    unittest.main()
