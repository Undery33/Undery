import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[2] / 'deploy' / 'deployment-policy.py'
spec = importlib.util.spec_from_file_location('deployment_policy', SCRIPT)
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


def event(number, branch='feature/web-computer', sha='a' * 40, kind='push'):
    return dict(id=number, timestamp=f'2026-11-17T00:00:{number:02d}Z',
                ref='refs/heads/' + branch, after=sha, activity_type=kind)


class DeploymentPolicyTests(unittest.TestCase):
    def test_select_without_timestamps_and_resume_from_old_checkpoint(self):
        old = event(1)
        newer = event(2)
        del old['timestamp'], newer['timestamp']
        checkpoint = dict(id='1', pushed_at='2026-11-17T00:00:01Z',
                          branch='feature/web-computer', sha='a' * 40)
        self.assertIsNone(policy.latest([old], checkpoint))
        self.assertEqual(policy.latest([newer, old], checkpoint)['id'], 2)

    def test_legacy_push_shape_and_out_of_date_feed(self):
        old = event(1)
        old['pushed_at'] = old.pop('timestamp')
        old['push_type'] = old.pop('activity_type')
        self.assertEqual(policy.latest([old])['pushed_at'], old['pushed_at'])
        self.assertIsNone(policy.latest([old], policy.latest([event(2)])))

    def test_deletion_uses_activity_type_even_with_a_nonzero_sha(self):
        self.assertIsNone(policy.latest([event(2, kind='branch_deletion'), event(1)]))

    def test_last_push_wins_in_github_order_even_with_an_older_commit(self):
        newest = event(4, 'feature/network/vlan', '1' * 40, 'force_push')
        selected = policy.latest([event(5, 'main'), newest, event(3)])
        self.assertEqual((selected['branch'], selected['sha']), ('feature/network/vlan', '1' * 40))

    def test_creation_at_an_existing_sha_is_a_new_deployment(self):
        previous = policy.latest([event(1)])
        created = event(2, 'feature/new', previous['sha'], 'branch_creation')
        self.assertEqual(policy.latest([created, event(1)], previous)['id'], 2)

    def test_deleted_refs_tags_and_already_completed_events_are_ignored(self):
        deleted = event(4, 'feature/new', '0' * 40, 'branch_deletion')
        tag = dict(event(3), ref='refs/tags/feature/fake')
        old = event(1)
        history = [deleted, tag, event(2, 'feature/new'), old]
        self.assertEqual(policy.latest(history)['id'], 1)
        self.assertIsNone(policy.latest(history, policy.latest([old])))

    def test_recreated_branch_wins_over_previous_deletion(self):
        history = [event(3), event(2, sha='0' * 40), event(1)]
        self.assertEqual(policy.latest(history)['id'], 3)

    def test_invalid_revision_cannot_be_passed_to_jenkins(self):
        with self.assertRaises(ValueError):
            policy.latest([event(1, sha='HEAD')])

    def test_newer_push_during_build_and_durable_ack_after_success(self):
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, HOME=temp, JOB_NAME='Undery_Feature'):
            pending = Path(temp) / 'event.json'
            with patch.object(policy, 'activities', return_value=[event(2)]), \
                    patch.object(sys, 'argv', ['policy', 'select', str(pending)]):
                policy.main()
            self.assertFalse(policy.state_path().exists())
            with patch.object(policy, 'activities', return_value=[event(3), event(2)]), \
                    patch.object(sys, 'argv', ['policy', 'current', str(pending)]), \
                    self.assertRaises(SystemExit) as raised:
                policy.main()
            self.assertEqual(raised.exception.code, 3)
            subprocess.run([sys.executable, str(SCRIPT), 'complete', str(pending)], check=True)
            self.assertEqual(json.loads(policy.state_path().read_text())['id'], 2)
            self.assertIsNone(policy.latest([event(2)], json.loads(policy.state_path().read_text())))


if __name__ == '__main__':
    unittest.main()
