import copy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

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


if __name__ == '__main__':
    unittest.main()
