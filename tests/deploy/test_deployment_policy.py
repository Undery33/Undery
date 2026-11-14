import importlib.util
from pathlib import Path
import subprocess
import sys
import unittest


SCRIPT = Path(__file__).resolve().parents[2] / 'deploy' / 'deployment-policy.py'
spec = importlib.util.spec_from_file_location('deployment_policy', SCRIPT)
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


class DeploymentPolicyTests(unittest.TestCase):
    def test_vrchat_scm_change_publishes_without_manual_checkbox(self):
        self.assertEqual(policy.deployment_mode(policy.AUTO_BRANCH, 'a'*40, 'b'*40, scm=True), 'auto')

    def test_infrastructure_only_change_does_not_redeploy_gui(self):
        self.assertEqual(policy.deployment_mode(policy.AUTO_BRANCH, 'a'*40, 'a'*40, scm=True), 'check')

    def test_manual_validation_does_not_publish_changed_gui(self):
        self.assertEqual(policy.deployment_mode(policy.AUTO_BRANCH, 'a'*40, 'b'*40), 'check')

    def test_other_feature_branch_requires_explicit_manual_deployment(self):
        self.assertEqual(policy.deployment_mode('feature/other-gui', 'a'*40, 'b'*40, scm=True), 'check')
        self.assertEqual(policy.deployment_mode('feature/other-gui', 'a'*40, '', manual=True), 'manual')

    def test_first_build_and_invalid_baselines_only_validate(self):
        for previous in ('', 'abc', 'invalid', 'b'*39):
            with self.subTest(previous=previous):
                self.assertEqual(policy.deployment_mode(policy.AUTO_BRANCH, 'a'*40, previous, scm=True), 'check')

    def test_main_and_invalid_refs_are_never_deployed(self):
        for branch in ('main', 'refs/heads/main', 'feature/../main', 'feature/-bad', 'feature/ok;echo'):
            with self.subTest(branch=branch), self.assertRaises(ValueError):
                policy.deployment_mode(branch, 'a'*40, 'b'*40, manual=True, scm=True)

    def test_invalid_current_identity_fails_closed(self):
        for commit in ('', 'HEAD', 'a'*39):
            with self.subTest(commit=commit), self.assertRaises(ValueError):
                policy.deployment_mode(policy.AUTO_BRANCH, commit, 'b'*40, manual=True)

    def test_cli_boolean_strings_and_stdout_contract(self):
        for manual, scm, expected in [('false', 'true', 'auto'), ('false', 'false', 'check'), ('true', 'false', 'manual')]:
            result = subprocess.run([sys.executable, str(SCRIPT), '--branch', policy.AUTO_BRANCH,
                                     '--commit', 'a'*40, '--previous', 'b'*40,
                                     '--manual', manual, '--scm', scm], capture_output=True, text=True, check=True)
            self.assertEqual(result.stdout, expected+'\n')


if __name__ == '__main__':
    unittest.main()
