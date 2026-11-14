import copy
import importlib.util
import io
import json
from pathlib import Path
import stat
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location(
    'container_deploy', Path(__file__).resolve().parents[2] / 'deploy/undery-deploy-container.py')
deployment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deployment)

GUI = 'a' * 40
PIPELINE = 'b' * 40
BRANCH = 'feature/vrchat-web-gui'
IMAGE = 'ghcr.io/undery33/undery@sha256:' + 'c' * 64
ARGS = (GUI, BRANCH, PIPELINE, IMAGE)


def container(running=True):
    return {
        'Config': {'Labels': {deployment.OWNER_LABEL: deployment.OWNER_VALUE}},
        'HostConfig': {'RestartPolicy': {'Name': 'unless-stopped', 'MaximumRetryCount': 0}},
        'State': {'Running': running},
    }


class FakeHost:
    def __init__(self, existing=False, enabled='enabled'):
        self.containers = {deployment.CURRENT: container()} if existing else {}
        self.legacy = {'active': not existing, 'enabled': enabled}
        self.events = []
        self.bad_health = set()
        self.fail_disable = False

    def container(self, name):
        info = self.containers.get(name)
        if info:
            deployment.require(info['Config']['Labels'].get(deployment.OWNER_LABEL)
                               == deployment.OWNER_VALUE, 'Foreign container')
        return copy.deepcopy(info)

    def service_state(self):
        return dict(self.legacy)

    def pull(self, *args):
        self.events.append(('pull', *args))

    def run(self, name, image, candidate=False):
        self.events.append(('run', name, candidate))
        assert name not in self.containers
        self.containers[name] = container()

    def candidate_url(self, name):
        return 'http://127.0.0.1:49152/api/health'

    def remove(self, name):
        self.events.append(('remove', name))
        self.containers.pop(name, None)

    def stop(self, name):
        self.events.append(('stop', name))
        self.containers[name]['State']['Running'] = False

    def start(self, name):
        self.events.append(('start', name))
        self.containers[name]['State']['Running'] = True

    def rename(self, source, destination):
        self.events.append(('rename', source, destination))
        assert destination not in self.containers
        self.containers[destination] = self.containers.pop(source)

    def restart_policy(self, name, policy):
        self.events.append(('restart_policy', name, policy))
        self.containers[name]['HostConfig']['RestartPolicy'] = dict(policy)

    def service(self, action, runtime=False):
        self.events.append(('service', action, runtime))
        if action == 'start':
            self.legacy['active'] = True
        elif action == 'stop':
            self.legacy['active'] = False
        elif action == 'disable':
            self.legacy['enabled'] = 'disabled'
            if self.fail_disable:
                raise RuntimeError('injected disable failure')
        elif action == 'enable':
            self.legacy['enabled'] = 'enabled-runtime' if runtime else 'enabled'

    def healthy(self, url, expected):
        self.events.append(('healthy', url, expected))
        return url not in self.bad_health


class ContainerDeploymentTests(unittest.TestCase):
    def test_requires_full_revisions_feature_branch_and_fixed_immutable_repository(self):
        deployment.validate_arguments(*ARGS)
        for invalid in [
            ('a' * 7, BRANCH, PIPELINE, IMAGE),
            (GUI, 'main', PIPELINE, IMAGE),
            (GUI, 'feature/../main', PIPELINE, IMAGE),
            (GUI, BRANCH, 'b' * 7, IMAGE),
            (GUI, BRANCH, PIPELINE, 'ghcr.io/undery33/undery:latest'),
            (GUI, BRANCH, PIPELINE, IMAGE.replace('/undery@', '/other@')),
        ]:
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                deployment.validate_arguments(*invalid)

    def test_image_labels_digest_and_declared_volumes_are_checked(self):
        info = {'RepoDigests': [IMAGE], 'Config': {'Labels': {
            'org.opencontainers.image.revision': GUI,
            'org.opencontainers.image.source': 'https://github.com/Undery33/Undery',
            'org.undery.branch': BRANCH,
            'org.undery.pipeline-revision': PIPELINE,
        }}}
        deployment.verify_image(info, *ARGS)
        for key in info['Config']['Labels']:
            invalid = copy.deepcopy(info)
            invalid['Config']['Labels'][key] = 'wrong'
            with self.subTest(label=key), self.assertRaises(ValueError):
                deployment.verify_image(invalid, *ARGS)
        invalid = copy.deepcopy(info)
        invalid['RepoDigests'] = []
        with self.assertRaises(ValueError):
            deployment.verify_image(invalid, *ARGS)
        info['Config']['Volumes'] = {'/data': {}}
        with self.assertRaises(ValueError):
            deployment.verify_image(info, *ARGS)

    def test_docker_runtime_is_nonroot_readonly_loopback_and_has_no_host_mounts(self):
        host = deployment.DockerHost()
        with patch.object(host, 'container', return_value=None), patch.object(host, 'docker') as docker:
            host.run(deployment.CURRENT, IMAGE)
            args = docker.call_args.args
            for flag, value in [('--user', '101:101'), ('--cap-drop', 'ALL'),
                                ('--security-opt', 'no-new-privileges'), ('--pids-limit', '128'),
                                ('--memory', '256m'), ('--cpus', '1'),
                                ('--restart', 'unless-stopped'),
                                ('--entrypoint', '/usr/local/bin/node'),
                                ('--publish', '127.0.0.1:3000:8080')]:
                self.assertEqual(args[args.index(flag) + 1], value)
            self.assertEqual(args[-2:], (IMAGE, '/opt/undery/container-entrypoint.mjs'))
            self.assertIn('--read-only', args)
            self.assertIn('/tmp:rw,noexec,nosuid,size=64m,mode=1777', args)
            self.assertNotIn('--privileged', args)
            self.assertNotIn('--mount', args)
            self.assertNotIn('--volume', args)
            self.assertNotIn('-v', args)
            self.assertNotIn('--env-file', args)
            self.assertNotIn('--network', args)
            host.run('undery-web-candidate-123-456', IMAGE, candidate=True)
            args = docker.call_args.args
            self.assertEqual(args[args.index('--publish') + 1], '127.0.0.1::8080')
            self.assertEqual(args[args.index('--restart') + 1], 'no')
            self.assertEqual(args[args.index('--entrypoint') + 1], '/usr/local/bin/node')
            self.assertEqual(args[-2:], (IMAGE, '/opt/undery/container-entrypoint.mjs'))

    def test_candidate_failure_preserves_running_legacy_service(self):
        host = FakeHost()
        host.bad_health.add('http://127.0.0.1:49152/api/health')
        with self.assertRaisesRegex(ValueError, 'Candidate health failed'):
            deployment.deploy(host, *ARGS, suffix='123-456')
        self.assertEqual(host.legacy, {'active': True, 'enabled': 'enabled'})
        self.assertEqual(host.containers, {})
        self.assertFalse(any(event[0] == 'service' for event in host.events))

    def test_success_disables_legacy_only_after_local_and_public_health(self):
        host = FakeHost()
        result = deployment.deploy(host, *ARGS, suffix='123-456')
        self.assertEqual(result['status'], 'deployed')
        self.assertEqual(host.legacy, {'active': False, 'enabled': 'disabled'})
        self.assertEqual(set(host.containers), {deployment.CURRENT})
        health_events = [event for event in host.events if event[0] == 'healthy']
        self.assertEqual([event[1] for event in health_events], [
            'http://127.0.0.1:49152/api/health', deployment.LOCAL_HEALTH, deployment.PUBLIC_HEALTH])
        self.assertTrue(all(event[2] == deployment.expected_health(GUI, BRANCH, PIPELINE)
                            for event in health_events))
        self.assertEqual(host.events[-1], ('service', 'disable', False))

    def test_local_failure_removes_new_container_and_restores_legacy(self):
        host = FakeHost()
        host.bad_health.add(deployment.LOCAL_HEALTH)
        with self.assertRaisesRegex(RuntimeError, 'previous runtime restored'):
            deployment.deploy(host, *ARGS, suffix='123-456')
        self.assertEqual(host.legacy, {'active': True, 'enabled': 'enabled'})
        self.assertEqual(host.containers, {})

    def test_https_failure_restores_existing_container_and_restart_policy(self):
        host = FakeHost(existing=True, enabled='disabled')
        original = copy.deepcopy(host.containers[deployment.CURRENT])
        host.bad_health.add(deployment.PUBLIC_HEALTH)
        with self.assertRaisesRegex(RuntimeError, 'previous runtime restored'):
            deployment.deploy(host, *ARGS, suffix='123-456')
        self.assertEqual(host.containers, {deployment.CURRENT: original})
        self.assertEqual(host.legacy, {'active': False, 'enabled': 'disabled'})

    def test_success_retains_previous_container_stopped_without_restart(self):
        host = FakeHost(existing=True, enabled='disabled')
        result = deployment.deploy(host, *ARGS, suffix='123-456')
        backup = host.containers[result['previousContainer']]
        self.assertFalse(backup['State']['Running'])
        self.assertEqual(backup['HostConfig']['RestartPolicy']['Name'], 'no')
        self.assertTrue(host.containers[deployment.CURRENT]['State']['Running'])

    def test_enablement_is_restored_if_disable_fails_partway(self):
        host = FakeHost(enabled='enabled-runtime')
        host.fail_disable = True
        with self.assertRaisesRegex(RuntimeError, 'previous runtime restored'):
            deployment.deploy(host, *ARGS, suffix='123-456')
        self.assertEqual(host.legacy, {'active': True, 'enabled': 'enabled-runtime'})
        self.assertEqual(host.containers, {})

    def test_rename_timeout_after_daemon_success_still_restores_previous_name(self):
        host = FakeHost(existing=True, enabled='disabled')
        original_rename = host.rename

        def timeout_once(source, destination):
            original_rename(source, destination)
            if source == deployment.CURRENT:
                raise TimeoutError('CLI timed out after daemon renamed the container')

        host.rename = timeout_once
        with self.assertRaisesRegex(RuntimeError, 'previous runtime restored'):
            deployment.deploy(host, *ARGS, suffix='123-456')
        self.assertEqual(set(host.containers), {deployment.CURRENT})
        self.assertTrue(host.containers[deployment.CURRENT]['State']['Running'])
        self.assertEqual(host.containers[deployment.CURRENT]['HostConfig']['RestartPolicy']['Name'],
                         'unless-stopped')

    def test_unowned_current_container_is_rejected_before_any_mutation(self):
        host = FakeHost(existing=True)
        host.containers[deployment.CURRENT]['Config']['Labels'] = {}
        with self.assertRaisesRegex(ValueError, 'Foreign container'):
            deployment.deploy(host, *ARGS, suffix='123-456')
        self.assertEqual(host.events, [])


class BirthdayRuntimeTests(unittest.TestCase):
    ENV = b'BIRTHDAY_MEMO_DATABASE_URL=postgresql://memo:local-test@existing-postgres/birthday\nBIRTHDAY_MEMO_TRUST_PROXY=true\n'
    SETTINGS = b'{"network":"undery-existing-data"}'

    def load(self, environment=None, settings=None):
        environment = self.ENV if environment is None else environment
        settings = self.SETTINGS if settings is None else settings
        with patch.object(deployment.os.path, 'lexists', return_value=True), \
                patch.object(deployment, 'trusted_path') as trusted, \
                patch.object(deployment, 'private_file_bytes', side_effect=[environment, settings]):
            result = deployment.read_birthday_runtime()
            self.assertEqual([call.args[0] for call in trusted.call_args_list],
                             [deployment.BIRTHDAY_DIRECTORY.parent, deployment.BIRTHDAY_DIRECTORY])
            return result

    def test_missing_pair_preserves_legacy_but_partial_pair_fails_closed(self):
        with patch.object(deployment.os.path, 'lexists', return_value=False), \
                patch.object(deployment, 'trusted_path') as trusted:
            self.assertIsNone(deployment.read_birthday_runtime())
            trusted.assert_not_called()
        for present in ([True, False], [False, True]):
            with self.subTest(present=present), \
                    patch.object(deployment.os.path, 'lexists', side_effect=present), \
                    self.assertRaisesRegex(ValueError, 'installed together'):
                deployment.read_birthday_runtime()

    def test_root_owner_private_file_and_no_symlink_are_required(self):
        for mode, uid in [(stat.S_IFLNK | 0o600, 0), (stat.S_IFREG | 0o640, 0),
                          (stat.S_IFREG | 0o600, 1000), (stat.S_IFDIR | 0o600, 0)]:
            path = Mock()
            path.lstat.return_value = SimpleNamespace(st_mode=mode, st_uid=uid)
            with self.subTest(mode=mode, uid=uid), self.assertRaises(ValueError):
                deployment.trusted_path(path, private=True)
        directory = Mock()
        directory.lstat.return_value = SimpleNamespace(st_mode=stat.S_IFDIR | 0o750, st_uid=0)
        deployment.trusted_path(directory, directory=True)

    def test_opened_inode_is_rechecked_bounded_and_opened_without_following(self):
        class BytesFile(io.BytesIO):
            def fileno(self):
                return 123
        valid = SimpleNamespace(st_mode=stat.S_IFREG | 0o600, st_uid=0, st_size=3)
        for info, data, limit, succeeds in [
            (valid, b'abc', 3, True),
            (SimpleNamespace(st_mode=stat.S_IFREG | 0o644, st_uid=0, st_size=3), b'abc', 3, False),
            (SimpleNamespace(st_mode=stat.S_IFREG | 0o600, st_uid=1000, st_size=3), b'abc', 3, False),
            (SimpleNamespace(st_mode=stat.S_IFREG | 0o700, st_uid=0, st_size=3), b'abc', 3, False),
            (SimpleNamespace(st_mode=stat.S_IFREG | 0o600, st_uid=0, st_size=4), b'abcd', 3, False),
            (valid, b'abcd', 3, False),  # File grew after fstat.
        ]:
            with self.subTest(info=info, data=data), \
                    patch.object(deployment, 'trusted_path'), \
                    patch.object(deployment.os, 'O_NOFOLLOW', 0x20000000, create=True), \
                    patch.object(deployment.os, 'O_CLOEXEC', 0x10000000, create=True), \
                    patch.object(deployment.os, 'open', return_value=123) as opened, \
                    patch.object(deployment.os, 'fdopen', return_value=BytesFile(data)), \
                    patch.object(deployment.os, 'fstat', return_value=info):
                if succeeds:
                    self.assertEqual(deployment.private_file_bytes(deployment.BIRTHDAY_ENV, limit), data)
                else:
                    with self.assertRaises(ValueError):
                        deployment.private_file_bytes(deployment.BIRTHDAY_ENV, limit)
                self.assertEqual(opened.call_args.args[1],
                                 deployment.os.O_RDONLY | 0x20000000 | 0x10000000)

    def test_environment_accepts_only_explicit_connection_settings_without_echoing_values(self):
        valid = self.load()
        self.assertEqual(valid['network'], 'undery-existing-data')
        self.assertNotIn('local-test', repr(valid))
        self.assertEqual(len(valid['environment_sha256']), 64)
        self.load(environment=b'PGHOST=existing-postgres\nPGDATABASE=birthday\nPGUSER=memo\nPGPASSWORD=local-test\n')
        self.load(environment=b'BIRTHDAY_MEMO_ENABLED=false\n')
        for invalid in [
            self.ENV + b'NODE_OPTIONS=--require=/tmp/x\n',
            self.ENV + b'LD_PRELOAD=/tmp/x\n',
            self.ENV + b'PGSSLROOTCERT=/tmp/root.pem\n',
            self.ENV + b'PGSSLCERT=/tmp/client.pem\n',
            self.ENV + b'PGSSLKEY=/tmp/client.key\n',
            self.ENV + b'PGPASSWORD\n',
            self.ENV + b'BIRTHDAY_MEMO_TRUST_PROXY=false\n',
            b'BIRTHDAY_MEMO_ENABLED=yes\n',
            b'PGHOST=existing-postgres\nPGUSER=memo\n',
            b'BIRTHDAY_MEMO_DATABASE_URL=local-test\x00\n',
            b'\xff\n',
        ]:
            with self.subTest(invalid=invalid), self.assertRaises(ValueError) as raised:
                self.load(environment=invalid)
            self.assertNotIn('local-test', str(raised.exception))

    def test_network_json_rejects_special_networks_options_unknown_keys_and_bad_names(self):
        for name in ['host', 'none', 'bridge', '--network=host', 'bad name', 'a/b', 'a' * 129, None]:
            with self.subTest(network=name), self.assertRaises(ValueError):
                self.load(settings=json.dumps({'network': name}).encode())
        for value in [b'{}', b'[]', b'{bad', b'{"network":"data","environmentFile":"/tmp/env"}',
                      b'{"network":"first","network":"second"}']:
            with self.subTest(settings=value), self.assertRaises(ValueError):
                self.load(settings=value)

    def test_candidate_and_production_share_fixed_env_file_and_existing_bridge_network(self):
        settings = self.load()
        host = deployment.DockerHost(settings)
        network = SimpleNamespace(stdout=json.dumps([{'Name': settings['network'], 'Driver': 'bridge'}]))
        with patch.object(host, 'container', return_value=None), \
                patch.object(deployment, 'read_birthday_runtime', return_value=settings), \
                patch.object(host, 'docker', return_value=network) as docker:
            host.run('undery-web-candidate-123-456', IMAGE, candidate=True)
            host.run(deployment.CURRENT, IMAGE)
            runs = [call.args for call in docker.call_args_list if call.args[0] == 'run']
            self.assertEqual(len(runs), 2)
            for args in runs:
                self.assertEqual(args[args.index('--env-file') + 1], str(deployment.BIRTHDAY_ENV))
                self.assertEqual(args[args.index('--network') + 1], settings['network'])
                self.assertNotIn('local-test', repr(args))
                self.assertNotIn('--mount', args)
                self.assertNotIn('--privileged', args)

    def test_invalid_or_changed_runtime_never_starts_a_container(self):
        settings = self.load()
        host = deployment.DockerHost(settings)
        for network in [[{'Name': settings['network'], 'Driver': 'host'}],
                        [{'Name': 'wrong', 'Driver': 'bridge'}], [], {}]:
            with self.subTest(network=network), \
                    patch.object(host, 'container', return_value=None), \
                    patch.object(deployment, 'read_birthday_runtime', return_value=settings), \
                    patch.object(host, 'docker', return_value=SimpleNamespace(stdout=json.dumps(network))) as docker, \
                    self.assertRaises(ValueError):
                host.run(deployment.CURRENT, IMAGE)
            self.assertFalse(any(call.args[0] == 'run' for call in docker.call_args_list))
        with patch.object(host, 'container', return_value=None), \
                patch.object(deployment, 'read_birthday_runtime', return_value=None), \
                patch.object(host, 'docker') as docker, self.assertRaisesRegex(ValueError, 'changed'):
            host.run(deployment.CURRENT, IMAGE)
        docker.assert_not_called()

    def test_rollback_preserves_previous_database_environment_and_network(self):
        candidate_url = 'http://127.0.0.1:49152/api/health'
        for failed_url in [candidate_url, deployment.LOCAL_HEALTH, deployment.PUBLIC_HEALTH]:
            host = FakeHost(existing=True, enabled='disabled')
            host.containers[deployment.CURRENT]['Config']['Env'] = ['BIRTHDAY_MEMO_ENABLED=false']
            host.containers[deployment.CURRENT]['NetworkSettings'] = {'Networks': {'previous-data': {}}}
            original = copy.deepcopy(host.containers[deployment.CURRENT])
            host.healthy = deployment.DockerHost(self.load()).healthy

            def feed_response(url, limit):
                if url == failed_url.replace('/api/health', '/birthday/memo/feed?page=0&order=oldest'):
                    raise OSError('database unavailable')
                return {'ok': True, 'page': 0, 'entries': []}

            error_type = ValueError if failed_url == candidate_url else RuntimeError
            error_message = 'Candidate health failed' if failed_url == candidate_url else 'previous runtime restored'
            with self.subTest(failed_url=failed_url), \
                    patch.object(deployment, 'healthy', return_value=True), \
                    patch.object(deployment, 'read_json', side_effect=feed_response), \
                    patch.object(deployment.time, 'sleep'), \
                    self.assertRaisesRegex(error_type, error_message):
                deployment.deploy(host, *ARGS, suffix='123-456')
            self.assertEqual(host.containers, {deployment.CURRENT: original})
            if failed_url == candidate_url:
                self.assertFalse(any(event[0] == 'stop' for event in host.events))

    def test_enabled_birthday_requires_readonly_database_feed_health_at_each_url(self):
        host = deployment.DockerHost(self.load())
        expected = deployment.expected_health(GUI, BRANCH, PIPELINE)
        for url in ['http://127.0.0.1:49152/api/health', deployment.LOCAL_HEALTH, deployment.PUBLIC_HEALTH]:
            with self.subTest(url=url), patch.object(deployment, 'healthy', return_value=True), \
                    patch.object(deployment, 'birthday_ready', return_value=False) as ready:
                self.assertFalse(host.healthy(url, expected))
                ready.assert_called_once_with(url, attempts=6 if url == deployment.PUBLIC_HEALTH else 40)
        with patch.object(deployment, 'healthy', return_value=False), \
                patch.object(deployment, 'birthday_ready') as ready:
            self.assertFalse(host.healthy(deployment.LOCAL_HEALTH, expected))
            ready.assert_not_called()
        for config in [None, self.load(environment=b'BIRTHDAY_MEMO_ENABLED=false\n')]:
            with patch.object(deployment, 'healthy', return_value=True), \
                    patch.object(deployment, 'birthday_ready') as ready:
                self.assertTrue(deployment.DockerHost(config).healthy(deployment.LOCAL_HEALTH, expected))
                ready.assert_not_called()

    def test_feed_probe_uses_readonly_oldest_path_and_fails_on_bad_database_response(self):
        with patch.object(deployment, 'read_json', return_value={'ok': True, 'page': 0, 'entries': []}) as read:
            self.assertTrue(deployment.birthday_ready(deployment.PUBLIC_HEALTH, attempts=1))
            read.assert_called_once_with('https://undery.link/birthday/memo/feed?page=0&order=oldest', 1048576)
        for response in [{'ok': False, 'page': 0, 'entries': []}, {'ok': True, 'page': 1, 'entries': []},
                         {'ok': True, 'page': 0}, {'ok': True, 'page': False, 'entries': []}, [], 'not JSON object']:
            with self.subTest(response=response), patch.object(deployment, 'read_json', return_value=response):
                self.assertFalse(deployment.birthday_ready(deployment.LOCAL_HEALTH, attempts=1))
        with patch.object(deployment, 'read_json', side_effect=OSError('unavailable')):
            self.assertFalse(deployment.birthday_ready(deployment.LOCAL_HEALTH, attempts=1))


if __name__ == '__main__':
    unittest.main()
