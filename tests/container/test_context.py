"""Verify the Docker context's source identity, boundaries and asset fidelity."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('container_context', ROOT / 'scripts/prepare-container-context.py')
CONTEXT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CONTEXT)


def git(path, *arguments):
    return subprocess.run(['git', '-C', str(path), *arguments], check=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.decode().strip()


def commit(path):
    git(path, 'add', '--all')
    git(path, '-c', 'user.name=Context Test', '-c', 'user.email=context@example.invalid',
        'commit', '--quiet', '-m', 'fixture')
    return git(path, 'rev-parse', 'HEAD')


class ContextTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / 'source'
        self.infra = self.root / 'infra'
        for checkout in (self.source, self.infra):
            checkout.mkdir()
            git(checkout, 'init', '--quiet')
        (self.source / 'dist/assets').mkdir(parents=True)
        (self.source / 'dist/index.html').write_text(
            '<!doctype html><link href="./styles.css" rel="stylesheet">'
            '<script src="./app.js"></script><img src="./assets/avatar.png">'
            '<a href="#profile">Profile</a>')
        (self.source / 'dist/styles.css').write_text('body {background: url("./assets/avatar.png")}')
        (self.source / 'dist/app.js').write_text('document.title = "Undery";')
        (self.source / 'dist/assets/avatar.png').write_bytes(b'\x89PNG\r\n\x1a\nfixture')
        self.sha = commit(self.source)
        (self.infra / 'deploy').mkdir()
        for name in ('Dockerfile', '.dockerignore', 'deploy/container-nginx.conf'):
            shutil.copyfile(ROOT / name, self.infra / name)
        self.pipeline_sha = commit(self.infra)

    def prepare(self, **overrides):
        options = {'source': self.source, 'output': self.root / 'context',
                   'commit': self.sha, 'branch': 'feature/vrchat-web-gui',
                   'pipeline_commit': self.pipeline_sha, 'infrastructure': self.infra}
        options.update(overrides)
        return CONTEXT.prepare_context(**options)

    def test_context_preserves_source_and_identifies_both_commits(self):
        (self.source / 'dist/.env').write_text('untracked secret must not be copied')
        metadata = self.prepare()
        output = self.root / 'context'
        self.assertEqual(json.loads((output / 'health.json').read_text()), metadata)
        self.assertEqual(metadata, {'status': 'ok', 'repository': 'Undery33/Undery',
                                    'commit': self.sha, 'branch': 'feature/vrchat-web-gui',
                                    'pipelineCommit': self.pipeline_sha})
        manifest = json.loads((output / 'asset-manifest.json').read_text())
        for name, digest in manifest.items():
            source = (self.source / 'dist' / name).read_bytes()
            self.assertEqual((output / 'dist' / name).read_bytes(), source)
            self.assertEqual(digest, hashlib.sha256(source).hexdigest())
        self.assertFalse((output / 'dist/.env').exists())
        self.assertFalse((output / '.git').exists())
        self.assertEqual((output / 'nginx.conf').read_bytes(),
                         (self.infra / 'deploy/container-nginx.conf').read_bytes())

    def test_main_invalid_sha_and_wrong_checkout_are_rejected(self):
        for overrides in ({'branch': 'main'}, {'branch': 'feature/../main'},
                          {'commit': 'abc'}, {'commit': '0' * 40},
                          {'pipeline_commit': '0' * 40}):
            with self.subTest(overrides=overrides), self.assertRaises(ValueError):
                self.prepare(**overrides)

    def test_changed_source_and_changed_infrastructure_are_rejected(self):
        original = (self.source / 'dist/app.js').read_bytes()
        (self.source / 'dist/app.js').write_text('modified after checkout')
        with self.assertRaisesRegex(ValueError, 'differs from selected commit'):
            self.prepare()
        (self.source / 'dist/app.js').write_bytes(original)
        (self.infra / 'Dockerfile').write_text('FROM different-image')
        with self.assertRaisesRegex(ValueError, 'differs from selected commit'):
            self.prepare()

    def test_tracked_hidden_env_file_is_rejected(self):
        (self.source / 'dist/.env.production').write_text('SECRET=value')
        self.sha = commit(self.source)
        with self.assertRaisesRegex(ValueError, 'hidden tracked path'):
            self.prepare()

    def test_tracked_symlink_is_rejected(self):
        (self.source / 'dist/link.png').symlink_to('assets/avatar.png')
        self.sha = commit(self.source)
        with self.assertRaisesRegex(ValueError, 'Unsafe tracked type'):
            self.prepare()

    def test_working_tree_symlink_is_rejected(self):
        (self.source / 'dist/assets/avatar.png').unlink()
        (self.source / 'dist/assets/avatar.png').symlink_to('../app.js')
        with self.assertRaisesRegex(ValueError, 'Only regular files'):
            self.prepare()

    def test_missing_outside_hidden_and_external_html_references_are_rejected(self):
        for reference in ('./missing.png', '../outside.png', './.env',
                          './%2e%2e/outside.png', 'https://outside.invalid/image.png', '//outside.invalid/x'):
            with self.subTest(reference=reference):
                (self.source / 'dist/index.html').write_text(f'<img src="{reference}">')
                self.sha = commit(self.source)
                with self.assertRaises(ValueError):
                    self.prepare()

    def test_missing_css_reference_is_rejected(self):
        (self.source / 'dist/styles.css').write_text('@import "./missing.css";')
        self.sha = commit(self.source)
        with self.assertRaisesRegex(ValueError, 'not a tracked dist file'):
            self.prepare()

    def test_existing_output_is_never_overwritten(self):
        output = self.root / 'context'
        output.mkdir()
        (output / 'keep.txt').write_text('keep')
        with self.assertRaisesRegex(ValueError, 'Output must not exist'):
            self.prepare()
        self.assertEqual((output / 'keep.txt').read_text(), 'keep')


if __name__ == '__main__':
    unittest.main()
