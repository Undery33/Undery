"""Run HTTP verification against the exact extracted deployment archive, unprivileged."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('release', root / 'deploy/undery-deploy-release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
info = json.loads((root / 'artifacts/release.json').read_text())
commit = os.environ.get('BUILD_COMMIT') or info['commit']
branch = os.environ.get('SOURCE_BRANCH') or info['branch']
with tempfile.TemporaryDirectory(prefix='undery-verify-') as directory:
    release.extract(root / 'artifacts/release.tar.gz', Path(directory), commit, branch)
    subprocess.run(['node', 'scripts/verify-production.mjs'], cwd=root, check=True,
                   env={**os.environ, 'RUNTIME_DIRECTORY': directory, 'BUILD_COMMIT': commit, 'SOURCE_BRANCH': branch})
