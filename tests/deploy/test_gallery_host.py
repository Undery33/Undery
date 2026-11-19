import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch


def load(filename):
    spec = importlib.util.spec_from_file_location('test_target', Path(__file__).resolve().parents[2] / 'deploy' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


installer = load('install-vrchat-gallery.py')
deployment = load('undery-deploy-container.py')


class GalleryHostTests(unittest.TestCase):
    def test_updates_only_the_existing_https_include_and_is_idempotent(self):
        comment = b'  # include /etc/nginx/snippets/undery-birthday-memo.conf;\n'
        conf = b'server {\n' + comment + b'  server_name undery.link;\n  include /etc/nginx/snippets/undery-birthday-memo.conf;\n}\n'
        updated = installer.updated_vhost(conf)
        self.assertEqual(updated.count(b'undery-vrchat-gallery.conf;'), 1)
        self.assertIn(comment, updated)
        self.assertIn(b'  include /etc/nginx/snippets/undery-vrchat-gallery.conf;\n}', updated)
        self.assertEqual(installer.updated_vhost(updated), updated)
        for invalid in (b'server {}', conf + conf, updated + updated):
            with self.assertRaises(SystemExit):
                installer.updated_vhost(invalid)

    def test_database_address_matches_only_the_existing_postgres_container(self):
        identity = json.dumps(dict(db='undery', role='gallery app', address='172.23.0.9')).encode()
        with patch.object(Path, 'read_bytes', return_value=b'{"network":"app-bridge"}'), \
             patch.object(installer, 'run') as run:
            network = {'web': {'IPv4Address': '172.23.0.4/24'}, 'pg': {'IPv4Address': '172.23.0.9/24'}}
            run.side_effect = [SimpleNamespace(stdout=identity), SimpleNamespace(stdout=json.dumps(network))] * 2
            self.assertEqual(installer.database(), ('pg', 'undery', 'gallery app'))
            with patch.object(installer, 'run', side_effect=[SimpleNamespace(stdout=identity), SimpleNamespace(stdout='{}')]):
                with self.assertRaises(SystemExit):
                    installer.database()

    def test_one_checked_mount_survives_both_container_names(self):
        settings = {'network': 'existing', 'admin_enabled': True, 'enabled': True}
        host = deployment.DockerHost(settings, gallery=True)
        with patch.object(host, 'container', return_value=None), patch.object(host, 'docker') as docker, \
             patch.object(deployment, 'read_birthday_runtime', return_value=settings), \
             patch.object(deployment, 'check_gallery_directory') as check:
            docker.return_value = Mock(stdout='[{"Name":"existing","Driver":"bridge"}]')
            for candidate in (False, True):
                host.run('undery-web-candidate-test' if candidate else deployment.CURRENT, 'test-image', candidate=candidate)
                args = docker.call_args.args
                self.assertEqual(args.count('--mount'), 1)
                path = '/var/lib/undery/vrchat-media'
                self.assertEqual(args[args.index('--mount') + 1], f'type=bind,src={path},dst={path}')
                self.assertEqual(args[args.index('--env') + 1], f'VRCHAT_MEDIA_DIR={path}')
                self.assertIn('--read-only', args)
                self.assertEqual(args[args.index('--memory') + 1], '512m')
            self.assertEqual(check.call_count, 2)

    def test_gallery_readiness_requires_a_successful_json_list_head(self):
        for status, content, expected in [(200, 'application/json', True), (503, 'application/json', False), (200, 'text/html', False)]:
            with patch.object(deployment, 'read_response', return_value=(status, {'Content-Type': content}, b'')) as read:
                self.assertEqual(deployment.gallery_ready(deployment.PUBLIC_HEALTH, 1), expected)
                read.assert_called_once_with('https://undery.link/api/vrchat/media', 0, method='HEAD')
