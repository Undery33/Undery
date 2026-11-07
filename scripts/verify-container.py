#!/usr/bin/env python3
"""Run the built image with production constraints and check its public contract."""
import argparse
from html.parser import HTMLParser
import json
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path


def docker(*args):
    return subprocess.check_output(['docker', *args], text=True).strip()


class Resources(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('img', 'script') and attrs.get('src'):
            self.urls.add(attrs['src'])
        if tag == 'link' and attrs.get('rel') == 'stylesheet':
            self.urls.add(attrs['href'])


def verify(base, expected):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def read(path, method='GET'):
        request = urllib.request.Request(urllib.parse.urljoin(base+'/', path), method=method)
        try:
            with opener.open(request, timeout=10) as response:
                return response.status, response.headers, response.read()
        except urllib.error.HTTPError as response:
            return response.code, response.headers, response.read()

    for attempt in range(60):
        try:
            status, headers, body = read('/api/health')
            if status == 200:
                break
        except OSError:
            pass
        time.sleep(0.25)
    else:
        raise RuntimeError('Container did not become healthy')
    assert json.loads(body) == expected, 'Wrong source or infrastructure revision'
    assert headers.get('Cache-Control') == 'no-store'
    for path in ('/', '/vrchat'):
        status, headers, body = read(path)
        assert status == 200, path
        assert headers.get('X-Content-Type-Options') == 'nosniff', path
        html = body.decode()
        assert 'START OVER' in html and 'data-open="profile"' in html
        assert '<dialog' in html and 'data-open="pictures"' in html and 'data-open="gallery"' in html
        resources = Resources()
        resources.feed(html)
        assert len(resources.urls) >= 6, 'Styles, script and all GUI images must be included'
        for resource in resources.urls:
            status, asset_headers, content = read(urllib.parse.urljoin(path, resource))
            assert status == 200 and content, resource
            if resource.endswith('.png'):
                assert content.startswith(b'\x89PNG\r\n\x1a\n'), resource
            if resource.endswith('.css'):
                assert 'text/css' in asset_headers.get('Content-Type', ''), resource
            if resource.endswith('.js'):
                assert 'javascript' in asset_headers.get('Content-Type', ''), resource
        print('PASS GUI, dialogs and all assets: '+path)
    for path, location in (('/vrchat/', '/vrchat'),
                           ('/vrchat/?view=gallery&from=qa', '/vrchat?view=gallery&from=qa')):
        status, headers, _ = read(path)
        assert status == 308, path
        assert headers.get('Location') == location, 'Redirect must preserve the public origin and query'
    print('PASS relative VRChat redirects and preserved query parameters')
    for path in ('/missing-page', '/.env', '/.git/config'):
        assert read(path)[0] == 404, path
    assert read('/', method='POST')[0] in (403, 405), 'Writes must be rejected'
    assert read('/', method='HEAD')[0] == 200
    print('PASS build identity, HTTP methods and real 404 responses')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', required=True)
    parser.add_argument('--metadata', type=Path, required=True)
    args = parser.parse_args()
    name = 'undery-test-'+uuid.uuid4().hex
    try:
        docker('run', '-d', '--name', name, '--read-only', '--user', '101:101',
               '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m,mode=1777', '--cap-drop=ALL',
               '--security-opt', 'no-new-privileges', '--pids-limit', '128',
               '--memory', '256m', '--cpus', '1', '-p', '127.0.0.1::8080', args.image)
        bindings = json.loads(docker('inspect', '--format', '{{json .NetworkSettings.Ports}}', name))
        port = bindings['8080/tcp'][0]['HostPort']
        verify('http://127.0.0.1:'+port, json.loads(args.metadata.read_text()))
    except BaseException:
        subprocess.run(['docker', 'logs', '--tail', '40', name], check=False)
        raise
    finally:
        subprocess.run(['docker', 'rm', '-f', name], check=False, stdout=subprocess.DEVNULL)


if __name__ == '__main__':
    main()
