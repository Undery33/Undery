import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import Mock

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('release', ROOT / 'deploy/undery-deploy-release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
spec = importlib.util.spec_from_file_location('packager', ROOT / 'scripts/package-release.py')
packager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packager)
COMMIT = 'a' * 40
BRANCH = 'feature/site-foundation'
METADATA = {'repository': 'Undery33/Undery', 'commit': COMMIT, 'branch': BRANCH}


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def archive(self, extra=(), metadata=None):
        archive = self.root / 'release.tar.gz'
        files = [('server.js', b'// runtime'), ('.next/BUILD_ID', b'build'),
                 ('.next/static/site.css', b'body {}'), ('content/computer/post.md', b'content'),
                 ('build-info.json', json.dumps(metadata or METADATA).encode())]
        with tarfile.open(archive, 'w:gz') as output:
            for name, data in [*files, *extra]:
                entry = tarfile.TarInfo(name)
                if data is None:
                    entry.type = tarfile.SYMTYPE
                    entry.linkname = '/etc/passwd'
                    output.addfile(entry)
                else:
                    entry.size = len(data)
                    output.addfile(entry, io.BytesIO(data))
        destination = self.root / 'runtime'
        destination.mkdir()
        return archive, destination

    def test_extracts_matching_feature_runtime(self):
        archive, destination = self.archive()
        release.extract(archive, destination, COMMIT, BRANCH)
        self.assertTrue((destination / '.next/cache').is_dir())
        self.assertEqual(json.loads((destination / 'build-info.json').read_text()), METADATA)

    def test_rejects_main_and_invalid_commit(self):
        for commit, branch in [(COMMIT, 'main'), ('HEAD', BRANCH), (COMMIT, 'feature/../main')]:
            with self.subTest(branch=branch), self.assertRaises(ValueError):
                release.validate_ref(commit, branch)

    def test_rejects_different_artifact_commit(self):
        archive, destination = self.archive(metadata={**METADATA, 'commit': 'b' * 40})
        with self.assertRaisesRegex(ValueError, 'does not match'):
            release.extract(archive, destination, COMMIT, BRANCH)

    def test_rejects_unsafe_archive_entries(self):
        for name, data in [('../escape', b'x'), ('/tmp/escape', b'x'),
                           ('link', None), ('.env.production', b'secret'), ('server.js', b'duplicate')]:
            with self.subTest(name=name):
                # Isolate archives so failures never reuse an extracted runtime.
                destination = self.root / 'runtime'
                if destination.exists():
                    import shutil
                    shutil.rmtree(destination)
                archive, destination = self.archive(extra=[(name, data)])
                with self.assertRaises(ValueError):
                    release.extract(archive, destination, COMMIT, BRANCH)
        self.assertFalse((self.root / 'escape').exists())

    def setup_activation(self):
        base = self.root / 'web'
        releases = base / 'releases'
        previous, candidate = releases / 'previous', releases / 'candidate'
        previous.mkdir(parents=True)
        candidate.mkdir()
        (base / 'current').symlink_to(previous)
        return base, previous, candidate

    def test_success_switches_once(self):
        base, previous, candidate = self.setup_activation()
        restart = Mock()
        release.activate(base, candidate, restart, lambda: True)
        self.assertEqual((base / 'current').resolve(), candidate)
        restart.assert_called_once()
        self.assertTrue(previous.is_dir())

    def test_health_failure_restores_previous(self):
        base, previous, candidate = self.setup_activation()
        restart = Mock()
        with self.assertRaisesRegex(RuntimeError, 'previous release restored'):
            release.activate(base, candidate, restart, lambda: False)
        self.assertEqual((base / 'current').resolve(), previous)
        self.assertEqual(restart.call_count, 2)

    def test_restart_failure_restores_previous(self):
        base, previous, candidate = self.setup_activation()
        restart = Mock(side_effect=[RuntimeError('restart failed'), None])
        with self.assertRaisesRegex(RuntimeError, 'previous release restored'):
            release.activate(base, candidate, restart, lambda: True)
        self.assertEqual((base / 'current').resolve(), previous)

    def test_packaged_runtime_round_trips_with_markdown_and_assets(self):
        _, runtime = self.archive()
        for name, data in [('server.js', '// runtime'), ('.next/BUILD_ID', 'build'),
                           ('.next/static/site.css', 'body {}'), ('content/computer/post.md', 'content'),
                           ('build-info.json', json.dumps(METADATA))]:
            file = runtime / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text(data)
        archive = self.root / 'artifacts/release.tar.gz'
        packager.package(runtime, archive)
        target = self.root / 'unpacked'
        target.mkdir()
        release.extract(archive, target, COMMIT, BRANCH)
        self.assertEqual((target / 'content/computer/post.md').read_text(), 'content')
        self.assertTrue(archive.with_suffix('.gz.sha256').exists())


if __name__ == '__main__':
    unittest.main()
