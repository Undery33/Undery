#!/usr/bin/env python3
"""Provision the existing production web/database pair. Run as the host administrator."""
import argparse
import fcntl
import ipaddress
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parent.parent
DATA = Path('/var/lib/undery/vrchat-media')
VHOST = Path('/etc/nginx/sites-available/undery.link')
SNIPPET = Path('/etc/nginx/snippets/undery-vrchat-gallery.conf')
HELPER = Path('/usr/local/sbin/undery-deploy-container')
WEB = 'undery-web-container'
DB_IDENTITY = """
const {Client} = require('pg');
(async () => {
  const c = new Client({connectionString:process.env.BIRTHDAY_MEMO_DATABASE_URL || process.env.DATABASE_URL,
                        connectionTimeoutMillis:5000});
  await c.connect();
  try {
    const {rows} = await c.query('select current_database() as db, current_user as role, host(inet_server_addr()) as address');
    console.log(JSON.stringify(rows[0]));
  } finally { await c.end(); }
})().catch(() => {console.error('Cannot verify the running application database');process.exitCode = 1;});
"""


def run(argv, **options):
    return subprocess.run(argv, check=True, **options)


def verify_source(revision):
    if not re.fullmatch('[0-9a-f]{40}', revision):
        raise SystemExit('Supply the full reviewed release revision.')
    git = ['/usr/bin/git', '-c', f'safe.directory={ROOT}', '-C', str(ROOT)]
    if run([*git, 'rev-parse', '--verify', 'HEAD^{commit}'], stdout=subprocess.PIPE).stdout.strip() != revision.encode():
        raise SystemExit('Checkout HEAD differs from the reviewed revision.')
    for name in ('deploy/install-vrchat-gallery.py', 'deploy/vrchat-gallery-host-location.conf',
                 'deploy/undery-deploy-container.py', 'src/lib/vrchat-gallery-migration.sql'):
        path = ROOT / name
        expected = run([*git, 'cat-file', 'blob', f'{revision}:{name}'], stdout=subprocess.PIPE).stdout
        if path.is_symlink() or path.read_bytes() != expected:
            raise SystemExit(f'Changed installer input: {name}')


def database():
    """Identify the actual connected database and login without exporting credentials."""
    identity = json.loads(run(['docker', 'exec', '-i', '-w', '/opt/undery/main', WEB, 'node', '-'],
                              input=DB_IDENTITY, text=True, stdout=subprocess.PIPE).stdout)
    network = json.loads(Path('/etc/undery/birthday-memo-runtime.json').read_bytes())['network']
    members = json.loads(run(['docker', 'network', 'inspect', '--format', '{{json .Containers}}', network],
                             stdout=subprocess.PIPE).stdout)
    server = ipaddress.ip_address(identity['address'])
    matches = [cid for cid, member in members.items() if any(
        addr and ipaddress.ip_interface(addr).ip == server
        for addr in (member.get('IPv4Address'), member.get('IPv6Address')))]
    if len(matches) != 1:
        raise SystemExit('The live PostgreSQL address did not match one container on the configured bridge.')
    return matches[0], identity['db'], identity['role']


def migrate(target, backup):
    container, name, role = target
    # The DBA connection stays inside its existing database container.
    pg = ['docker', 'exec', '-i', '--user', 'postgres', container, 'sh', '-ec',
          'tool=$1; db=$2; shift 2; exec "$tool" --username="${POSTGRES_USER:-postgres}" --dbname="$db" "$@"', 'pg']
    psql = [*pg, 'psql', name, '-X', '-w', '-v', 'ON_ERROR_STOP=1', '-v', 'app_role=' + role]
    exists = run([*psql, '-Atc', "SELECT to_regnamespace('vrchat_gallery') IS NOT NULL"],
                 stdout=subprocess.PIPE).stdout.strip() == b't'
    if backup is None:
        return
    if exists:
        with (backup / 'vrchat_gallery.dump').open('xb') as out:
            run([*pg, 'pg_dump', name, '-w', '--format=custom', '--schema=vrchat_gallery'], stdout=out)
    sql = (ROOT / 'src/lib/vrchat-gallery-migration.sql').read_bytes()
    grants = b'\nGRANT USAGE ON SCHEMA vrchat_gallery TO :"app_role";\nGRANT SELECT, INSERT ON vrchat_gallery.media TO :"app_role";\n'
    grants += b'GRANT UPDATE (deleted_at) ON vrchat_gallery.media TO :"app_role";\n'
    run(psql, input=sql + grants)


def updated_vhost(original):
    include = f'include {SNIPPET};'.encode()
    lines = original.splitlines(keepends=True)
    found = sum(line.strip() == include for line in lines)
    if found > 1:
        raise SystemExit('Duplicate gallery includes in the production vhost.')
    if found:
        return original
    anchor = b'include /etc/nginx/snippets/undery-birthday-memo.conf;'
    indexes = [i for i, line in enumerate(lines) if line.strip() == anchor]
    if len(indexes) != 1:
        raise SystemExit('Cannot identify the existing canonical HTTPS include. Verify the production vhost.')
    i = indexes[0]
    ending = b'\r\n' if lines[i].endswith(b'\r\n') else b'\n'
    following = lines[i].replace(anchor, include)
    if not lines[i].endswith(b'\n'):
        lines[i] += ending
    lines.insert(i + 1, following)
    return b''.join(lines)


def write_file(path, content, mode):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        temp = Path(stream.name)
    try:
        temp.write_bytes(content)
        temp.chmod(mode)
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)


def provision(check):
    for path in (VHOST, HELPER):
        if not path.is_file() or path.is_symlink():
            raise SystemExit(f'Expected the existing regular configuration file at {path}')
    if SNIPPET.is_symlink() or DATA.parent.is_symlink() or DATA.is_symlink():
        raise SystemExit('Expected regular gallery configuration and storage paths.')
    if DATA.parent.exists():
        parent = DATA.parent.stat()
        if not stat.S_ISDIR(parent.st_mode) or parent.st_uid != 0 or stat.S_IMODE(parent.st_mode) & 0o022:
            raise SystemExit(f'Expected a root-owned store parent at {DATA.parent}')
    if DATA.exists() and not DATA.is_dir():
        raise SystemExit(f'Expected a directory at {DATA}')
    updated = updated_vhost(VHOST.read_bytes())
    changes = [(SNIPPET, (ROOT / 'deploy/vrchat-gallery-host-location.conf').read_bytes(), 0o644),
               (VHOST, updated, stat.S_IMODE(VHOST.stat().st_mode)),
               (HELPER, (ROOT / 'deploy/undery-deploy-container.py').read_bytes(), 0o755)]
    run(['nginx', '-t'])
    target = database()
    if check:
        migrate(target, None)
        print('Preflight passed: release, existing database/DBA connection and canonical HTTPS ingress.')
        return
    DATA.parent.mkdir(mode=0o755, exist_ok=True)
    backup = Path(tempfile.mkdtemp(prefix='undery-vrchat-gallery-', dir='/var/backups'))
    print(f'Host configuration and existing gallery DB backups: {backup}', flush=True)
    migrate(target, backup)
    DATA.mkdir(mode=0o700, exist_ok=True)
    os.chown(DATA, 101, 101)
    DATA.chmod(0o700)
    changed = []
    try:
        for path, new, mode in changes:
            if path.exists() and path.read_bytes() == new:
                continue
            previous = None
            if path.exists():
                previous = backup / path.name
                shutil.copy2(path, previous)
            write_file(path, new, mode)
            changed.append((path, previous))
        if any(path in (VHOST, SNIPPET) for path, _ in changed):
            run(['nginx', '-t'])
            run(['systemctl', 'reload', 'nginx'])
    except BaseException:
        for path, previous in reversed(changed):
            if previous:
                write_file(path, previous.read_bytes(), stat.S_IMODE(previous.stat().st_mode))
            else:
                path.unlink(missing_ok=True)
        run(['nginx', '-t'])
        run(['systemctl', 'reload', 'nginx'])
        raise
    print('Gallery storage, schema, grants, deployment helper and host ingress are ready.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision', required=True, help='full SHA of the reviewed checkout')
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--check', action='store_true', help='read-only host and database preflight')
    modes.add_argument('--apply', action='store_true', help='apply the resumable host setup')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise SystemExit('Run the reviewed installer as the host administrator.')
    verify_source(args.revision)
    os.umask(0o077)
    if args.check:
        provision(True)
        raise SystemExit(0)
    lock = os.open('/run/lock/undery-container-deploy.lock', os.O_CREAT | os.O_NOFOLLOW | os.O_RDWR, 0o600)
    with os.fdopen(lock, 'w') as file:
        info = os.fstat(file.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077:
            raise SystemExit('Unexpected deployment lock ownership or mode.')
        fcntl.flock(file, fcntl.LOCK_EX)
        provision(False)
