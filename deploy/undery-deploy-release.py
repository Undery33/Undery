#!/usr/bin/python3
"""Root-owned fixed activation helper. Never execute repository scripts as root."""
import fcntl
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request

BASE = Path('/opt/personal-site/web')
MAX_ARCHIVE = 128 * 1024 * 1024
MAX_EXPANDED = 512 * 1024 * 1024


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_ref(commit, branch):
    require(bool(re.fullmatch(r'[a-f0-9]{40}', commit)), 'Full commit SHA required')
    require(bool(re.fullmatch(r'feature/[A-Za-z0-9][A-Za-z0-9._/-]*', branch))
            and '..' not in branch, 'Only feature/ branches are allowed')


def extract(archive_path, destination, commit, branch):
    validate_ref(commit, branch)
    seen = set()
    total = 0
    with tarfile.open(archive_path, 'r:gz') as archive:
        for member in archive:
            path = PurePosixPath(member.name)
            require(member.isfile() and str(path) == member.name and not path.is_absolute()
                    and '..' not in path.parts and '\\' not in member.name
                    and not any(ord(c) < 32 for c in member.name), 'Unsafe archive entry')
            require(not any(part.startswith('.env') for part in path.parts), 'Environment file rejected')
            require(member.name not in seen and len(seen) < 20000, 'Duplicate or excessive entries')
            require(0 <= member.size <= 128 * 1024 * 1024, 'Oversized file')
            total += member.size
            require(total <= MAX_EXPANDED, 'Oversized runtime')
            seen.add(member.name)
            target = destination / member.name
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
            with archive.extractfile(member) as source, target.open('xb') as output:
                shutil.copyfileobj(source, output)
            target.chmod(0o644)
    require({'server.js', '.next/BUILD_ID', 'build-info.json'} <= seen, 'Incomplete runtime')
    require(any(name.startswith('.next/static/') for name in seen), 'Static assets missing')
    require(any(name.startswith('content/computer/') for name in seen), 'Markdown content missing')
    metadata_file = destination / 'build-info.json'
    require(metadata_file.stat().st_size < 65536, 'Oversized metadata')
    metadata = json.loads(metadata_file.read_text())
    require(metadata == {'repository': 'Undery33/Undery', 'commit': commit, 'branch': branch},
            'Artifact does not match selected repository, commit and branch')
    (destination / '.next/cache').mkdir(exist_ok=True, mode=0o755)


def switch(current, target):
    # Create the temporary link on the same filesystem, then atomically replace.
    temp = current.with_name('.current-' + str(os.getpid()))
    try:
        temp.symlink_to(target)
        os.replace(temp, current)
    finally:
        temp.unlink(missing_ok=True)


def activate(base, release, restart, healthy):
    current = base / 'current'
    require(current.is_symlink(), 'Existing current symlink required')
    previous = current.resolve(strict=True)
    require(previous.parent == (base / 'releases').resolve(), 'Previous release outside release directory')
    try:
        switch(current, release)
        restart()
        require(healthy(), 'New runtime failed health verification')
    except BaseException as failure:
        switch(current, previous)
        try:
            restart()
        except Exception as rollback_error:
            raise RuntimeError('Release failed and previous service could not restart') from rollback_error
        raise RuntimeError('Release failed; previous release restored') from failure


def restart():
    subprocess.run(['/usr/bin/systemctl', 'restart', 'undery-web.service'],
                   check=True, timeout=60, env={'PATH': '/usr/bin:/bin'})


def healthy(commit, branch):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    for _ in range(40):
        try:
            with opener.open('http://127.0.0.1:3000/api/health', timeout=2) as response:
                body = response.read(65537)
                require(len(body) <= 65536, 'Oversized health response')
                data = json.loads(body)
            if data == {'status': 'ok', 'repository': 'Undery33/Undery', 'commit': commit, 'branch': branch}:
                return True
        except (OSError, ValueError):
            pass
        time.sleep(0.5)
    return False


def root_directory(path):
    for part in [path, *path.parents]:
        info = part.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022,
                'Deployment directories must be root-owned and not writable by other users')


def main():
    require(os.geteuid() == 0 and len(sys.argv) == 3, 'Root helper requires COMMIT BRANCH')
    commit, branch = sys.argv[1:]
    validate_ref(commit, branch)
    root_directory(BASE / 'releases')
    require((BASE / 'current').is_symlink(), 'Existing service installation required')
    # A separate process or Jenkins job cannot switch the release concurrently.
    fd = os.open('/run/lock/undery-feature-deploy.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        with tempfile.TemporaryDirectory(prefix='.incoming-', dir=BASE) as work:
            work = Path(work)
            archive = work / 'release.tar.gz'
            with archive.open('xb') as output:
                size = 0
                while block := sys.stdin.buffer.read(1024 * 1024):
                    size += len(block)
                    require(size <= MAX_ARCHIVE, 'Oversized archive')
                    output.write(block)
            candidate = work / 'runtime'
            candidate.mkdir(mode=0o755)
            extract(archive, candidate, commit, branch)
            release = BASE / 'releases' / (commit + '-' + work.name.removeprefix('.incoming-'))
            os.rename(candidate, release)
            activate(BASE, release, restart, lambda: healthy(commit, branch))
            print(json.dumps({'status': 'deployed', 'commit': commit, 'branch': branch}))


if __name__ == '__main__':
    def interrupted(signum, frame):
        raise RuntimeError('Deployment interrupted')
    signal.signal(signal.SIGTERM, interrupted)
    main()
