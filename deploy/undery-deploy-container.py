#!/usr/bin/python3
"""Root-owned activation of one fixed GHCR repository; never execute checkout code."""
from contextlib import ExitStack
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import time
import urllib.request

IMAGE_REPOSITORY = 'ghcr.io/undery33/undery'
DOCKER = '/usr/bin/docker'
DOCKER_CONFIG = Path('/etc/undery-ghcr')
SERVICE = 'undery-web.service'
CURRENT = 'undery-web-container'
OWNER_LABEL = 'org.undery.managed'
OWNER_VALUE = 'container-deploy-v1'
LOCAL_HEALTH = 'http://127.0.0.1:3000/api/health'
PUBLIC_HEALTH = 'https://undery.link/api/health'
BIRTHDAY_DIRECTORY = Path('/etc/undery')
BIRTHDAY_ENV = BIRTHDAY_DIRECTORY / 'birthday-memo.env'
BIRTHDAY_RUNTIME = BIRTHDAY_DIRECTORY / 'birthday-memo-runtime.json'
BIRTHDAY_ENV_KEYS = frozenset({
    'BIRTHDAY_MEMO_DATABASE_URL', 'BIRTHDAY_MEMO_ENABLED', 'BIRTHDAY_MEMO_TRUST_PROXY',
    'DATABASE_URL', 'PGHOST', 'PGDATABASE', 'PGUSER', 'PGPORT', 'PGPASSWORD',
    'PGSSLMODE', 'PGCONNECT_TIMEOUT',
})


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_arguments(commit, branch, pipeline_commit, image):
    require(bool(re.fullmatch(r'[a-f0-9]{40}', commit)), 'Full GUI commit SHA required')
    require(bool(re.fullmatch(r'[a-f0-9]{40}', pipeline_commit)), 'Full pipeline commit SHA required')
    require(bool(re.fullmatch(r'feature/[A-Za-z0-9][A-Za-z0-9._/-]*', branch))
            and '..' not in branch, 'Only feature/ source branches are allowed')
    require(bool(re.fullmatch(re.escape(IMAGE_REPOSITORY) + r'@sha256:[a-f0-9]{64}', image)),
            'An immutable digest from the fixed GHCR repository is required')


def expected_health(commit, branch, pipeline_commit):
    return {'status': 'ok', 'repository': 'Undery33/Undery', 'commit': commit,
            'branch': branch, 'pipelineCommit': pipeline_commit}


def verify_image(info, commit, branch, pipeline_commit, image):
    labels = info.get('Config', {}).get('Labels') or {}
    expected = {
        'org.opencontainers.image.revision': commit,
        'org.opencontainers.image.source': 'https://github.com/Undery33/Undery',
        'org.undery.branch': branch,
        'org.undery.pipeline-revision': pipeline_commit,
    }
    require(all(labels.get(key) == value for key, value in expected.items()),
            'Image provenance labels do not match the selected source and pipeline')
    require(image in info.get('RepoDigests', []), 'Pulled image digest does not match')
    require(not info.get('Config', {}).get('Volumes'), 'Image-declared volumes are not allowed')


def read_json(url, limit):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(url, timeout=5) as response:
        require(response.status == 200, 'Health endpoint must return HTTP 200')
        body = response.read(limit + 1)
    require(len(body) <= limit, 'Oversized health response')
    return json.loads(body)


def read_health(url):
    return read_json(url, 65536)


def healthy(url, expected, attempts=40):
    for attempt in range(attempts):
        try:
            if read_health(url) == expected:
                return True
        except (OSError, ValueError):
            pass
        if attempt + 1 < attempts:
            time.sleep(0.5)
    return False


def birthday_ready(health_url, attempts=40):
    require(health_url.endswith('/api/health'), 'Unexpected deployment health URL')
    url = health_url[:-len('/api/health')] + '/birthday/memo/feed?page=0&order=oldest'
    for attempt in range(attempts):
        try:
            result = read_json(url, 1048576)
            if (isinstance(result, dict) and result.get('ok') is True
                    and type(result.get('page')) is int and result.get('page') == 0
                    and isinstance(result.get('entries'), list)):
                return True
        except (OSError, ValueError):
            pass
        if attempt + 1 < attempts:
            time.sleep(0.5)
    return False


def private_file_bytes(path, limit):
    """Inspect the opened inode; never follow a symlink or include contents in errors."""
    trusted_path(path, private=True)
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    with os.fdopen(fd, 'rb') as stream:
        info = os.fstat(stream.fileno())
        require(stat.S_ISREG(info.st_mode) and info.st_uid == 0
                and stat.S_IMODE(info.st_mode) in (0o400, 0o600),
                'Birthday runtime files must be root-owned private regular files')
        require(info.st_size <= limit, 'Birthday runtime file is too large')
        data = stream.read(limit + 1)
    require(len(data) <= limit, 'Birthday runtime file is too large')
    return data


def validate_birthday_environment(data):
    try:
        text = data.decode('utf-8')
    except UnicodeError:
        raise ValueError('Birthday environment must be UTF-8') from None
    require('\x00' not in text, 'Birthday environment contains an invalid character')
    values = {}
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        key, separator, value = line.partition('=')
        require(separator and key in BIRTHDAY_ENV_KEYS and key not in values,
                'Birthday environment has an unknown, duplicate or incomplete key')
        # Docker env files use literal values, not shell expansion or shell quoting.
        values[key] = value
    for key in ('BIRTHDAY_MEMO_ENABLED', 'BIRTHDAY_MEMO_TRUST_PROXY'):
        if key in values:
            require(values[key] in ('true', 'false'), 'Birthday switches must be true or false')
    if values.get('BIRTHDAY_MEMO_ENABLED') != 'false':
        require(bool(values.get('BIRTHDAY_MEMO_DATABASE_URL') or values.get('DATABASE_URL'))
                or all(values.get(key) for key in ('PGHOST', 'PGDATABASE', 'PGUSER')),
                'Birthday runtime requires the existing PostgreSQL connection settings')
    # Do not return credentials; retain only a fingerprint for same-deployment consistency.
    return {'environment_sha256': hashlib.sha256(data).hexdigest(),
            'enabled': values.get('BIRTHDAY_MEMO_ENABLED') != 'false'}


def read_birthday_runtime():
    present = [os.path.lexists(path) for path in (BIRTHDAY_ENV, BIRTHDAY_RUNTIME)]
    if not any(present):
        return None
    require(all(present), 'Birthday environment and runtime settings must be installed together')
    trusted_path(BIRTHDAY_DIRECTORY.parent, directory=True)
    trusted_path(BIRTHDAY_DIRECTORY, directory=True)
    environment = private_file_bytes(BIRTHDAY_ENV, 65536)
    settings = private_file_bytes(BIRTHDAY_RUNTIME, 4096)
    def unique_keys(pairs):
        require(len({key for key, _ in pairs}) == len(pairs), 'Duplicate birthday settings key')
        return dict(pairs)
    try:
        config = json.loads(settings, object_pairs_hook=unique_keys)
    except (ValueError, UnicodeError):
        raise ValueError('Invalid birthday runtime JSON') from None
    require(isinstance(config, dict) and set(config) == {'network'},
            'Birthday runtime JSON must contain only the existing network name')
    network = config['network']
    require(isinstance(network, str)
            and bool(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,127}', network))
            and network not in ('host', 'none', 'bridge'), 'Invalid birthday Docker network name')
    return {'network': network, **validate_birthday_environment(environment),
            'settings_sha256': hashlib.sha256(settings).hexdigest()}


class DockerHost:
    def __init__(self, birthday_runtime=None):
        self.birthday_runtime = dict(birthday_runtime) if birthday_runtime is not None else None

    def command(self, args, timeout=60, check=True):
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout,
                                env={'PATH': '/usr/bin:/bin', 'HOME': '/root', 'LANG': 'C'})
        if check and result.returncode:
            # Do not print Docker credential/config data or uncontrolled command output.
            raise RuntimeError(f'Command failed ({result.returncode}): {args[0]} {args[1]}')
        return result

    def docker(self, *args, timeout=60, check=True):
        return self.command([DOCKER, '--config', str(DOCKER_CONFIG), *args], timeout, check)

    def container(self, name):
        result = self.docker('container', 'inspect', name, check=False)
        if result.returncode:
            if 'No such container' in result.stderr or 'No such object' in result.stderr:
                return None
            raise RuntimeError('Cannot inspect deployment container')
        info = json.loads(result.stdout)[0]
        require((info.get('Config', {}).get('Labels') or {}).get(OWNER_LABEL) == OWNER_VALUE,
                'Refusing to change a container not owned by this deployment helper')
        return info

    def pull(self, image, commit, branch, pipeline_commit):
        self.docker('pull', image, timeout=600)
        info = json.loads(self.docker('image', 'inspect', image).stdout)[0]
        verify_image(info, commit, branch, pipeline_commit, image)

    def run(self, name, image, candidate=False):
        require(self.container(name) is None, 'Container name is already in use')
        runtime_options = []
        if self.birthday_runtime is not None:
            require(read_birthday_runtime() == self.birthday_runtime,
                    'Birthday runtime settings changed during deployment; retry after review')
            network = self.birthday_runtime['network']
            info = json.loads(self.docker('network', 'inspect', network).stdout)
            require(isinstance(info, list) and len(info) == 1
                    and info[0].get('Name') == network and info[0].get('Driver') == 'bridge',
                    'Birthday runtime requires an existing Docker bridge network')
            runtime_options = ['--env-file', str(BIRTHDAY_ENV), '--network', network]
        self.docker(
            'run', '--detach', '--name', name, '--label', f'{OWNER_LABEL}={OWNER_VALUE}',
            '--user', '101:101', '--read-only', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m,mode=1777',
            '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
            '--pids-limit', '128', '--memory', '256m', '--cpus', '1',
            '--restart', 'no' if candidate else 'unless-stopped',
            '--publish', '127.0.0.1::8080' if candidate else '127.0.0.1:3000:8080',
            *runtime_options,
            '--entrypoint', '/usr/local/bin/node', image, '/opt/undery/container-entrypoint.mjs')

    def candidate_url(self, name):
        info = self.container(name)
        require(info is not None, 'Candidate container is missing')
        bindings = info.get('NetworkSettings', {}).get('Ports', {}).get('8080/tcp') or []
        require(len(bindings) == 1 and bindings[0].get('HostIp') == '127.0.0.1',
                'Candidate must bind only to loopback')
        port = bindings[0].get('HostPort', '')
        require(port.isdigit() and 1 <= int(port) <= 65535, 'Invalid candidate port')
        return f'http://127.0.0.1:{port}/api/health'

    def remove(self, name):
        if self.container(name) is not None:
            self.docker('container', 'rm', '--force', name)

    def stop(self, name):
        require(self.container(name) is not None, 'Container to stop is missing')
        self.docker('container', 'stop', '--time', '15', name)

    def start(self, name):
        require(self.container(name) is not None, 'Container to restart is missing')
        self.docker('container', 'start', name)

    def rename(self, source, destination):
        require(self.container(source) is not None, 'Container to rename is missing')
        require(self.container(destination) is None, 'Backup container name is already in use')
        self.docker('container', 'rename', source, destination)

    def restart_policy(self, name, policy):
        require(self.container(name) is not None, 'Container to update is missing')
        kind = policy.get('Name', 'no')
        count = policy.get('MaximumRetryCount', 0)
        require(kind in ('no', 'always', 'unless-stopped', 'on-failure')
                and isinstance(count, int) and 0 <= count <= 10000, 'Invalid restart policy')
        value = f'{kind}:{count}' if kind == 'on-failure' and count else kind
        self.docker('container', 'update', '--restart', value, name)

    def service_state(self):
        active = self.command(['/usr/bin/systemctl', 'is-active', SERVICE], check=False)
        enabled = self.command(['/usr/bin/systemctl', 'is-enabled', SERVICE], check=False)
        state = enabled.stdout.strip()
        require(state in ('enabled', 'enabled-runtime', 'disabled', 'static', 'indirect',
                          'masked', 'masked-runtime'), 'Unsupported legacy service enablement state')
        require(active.stdout.strip() in ('active', 'inactive', 'failed'),
                'Legacy service is transitioning; retry when stable')
        return {'active': active.stdout.strip() == 'active', 'enabled': state}

    def service(self, action, runtime=False):
        require(action in ('start', 'stop', 'enable', 'disable'), 'Invalid service operation')
        args = ['/usr/bin/systemctl', action]
        if runtime:
            args.append('--runtime')
        self.command([*args, SERVICE])

    def healthy(self, url, expected):
        attempts = 6 if url == PUBLIC_HEALTH else 40
        if not healthy(url, expected, attempts=attempts):
            return False
        return (self.birthday_runtime is None or not self.birthday_runtime['enabled']
                or birthday_ready(url, attempts=attempts))


def deploy(host, commit, branch, pipeline_commit, image, suffix=None):
    validate_arguments(commit, branch, pipeline_commit, image)
    expected = expected_health(commit, branch, pipeline_commit)
    suffix = suffix or f'{int(time.time())}-{os.getpid()}'
    require(bool(re.fullmatch(r'[0-9]+-[0-9]+', suffix)), 'Invalid internal deployment identifier')
    candidate = f'undery-web-candidate-{suffix}'
    previous = f'undery-web-previous-{suffix}'
    original = host.container(CURRENT)  # An unrelated container is never stopped or replaced.
    require(host.container(previous) is None and host.container(candidate) is None,
            'Internal deployment container name collision')
    legacy = host.service_state()
    host.pull(image, commit, branch, pipeline_commit)
    try:
        host.run(candidate, image, candidate=True)
        require(host.healthy(host.candidate_url(candidate), expected), 'Candidate health failed')
    finally:
        host.remove(candidate)

    attempted_new = False
    attempted_disable = False
    try:
        if original is not None:
            host.stop(CURRENT)
            host.rename(CURRENT, previous)
            host.restart_policy(previous, {'Name': 'no'})
        if legacy['active']:
            host.service('stop')
        attempted_new = True
        host.run(CURRENT, image)
        require(host.healthy(LOCAL_HEALTH, expected), 'Production loopback health failed')
        require(host.healthy(PUBLIC_HEALTH, expected), 'Public HTTPS health failed')
        if legacy['enabled'] in ('enabled', 'enabled-runtime'):
            attempted_disable = True
            host.service('disable', runtime=legacy['enabled'] == 'enabled-runtime')
    except BaseException as failure:
        errors = []

        def restore(action):
            try:
                action()
            except Exception as error:
                errors.append(type(error).__name__)

        if attempted_new:
            restore(lambda: host.remove(CURRENT))
        if original is not None:
            # The Docker daemon can finish rename even if its CLI times out.
            def restore_name():
                if host.container(previous) is not None:
                    host.rename(previous, CURRENT)
            restore(restore_name)
            restore(lambda: host.restart_policy(CURRENT, original['HostConfig']['RestartPolicy']))
            if original.get('State', {}).get('Running'):
                restore(lambda: host.start(CURRENT))
        if attempted_disable:
            restore(lambda: host.service('enable', runtime=legacy['enabled'] == 'enabled-runtime'))
        if legacy['active']:
            restore(lambda: host.service('start'))
        if errors:
            raise RuntimeError('Deployment failed; rollback needs administrator attention: '
                               + ', '.join(errors)) from failure
        raise RuntimeError('Deployment failed; previous runtime restored') from failure
    return {'status': 'deployed', 'commit': commit, 'branch': branch,
            'pipelineCommit': pipeline_commit, 'image': image,
            'previousContainer': previous if original is not None else None}


def trusted_path(path, directory=False, private=False):
    info = path.lstat()
    require(not stat.S_ISLNK(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o022,
            'Deployment paths must be root-owned and not writable by other users')
    require(stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode),
            'Unexpected deployment path type')
    if private:
        require(not info.st_mode & 0o077, 'Deployment configuration must be root-private')


def main():
    require(os.geteuid() == 0 and len(sys.argv) == 5,
            'Root helper requires GUI_COMMIT FEATURE_BRANCH PIPELINE_COMMIT IMAGE_DIGEST')
    validate_arguments(*sys.argv[1:])
    trusted_path(Path(DOCKER))
    trusted_path(DOCKER_CONFIG.parent, directory=True)
    trusted_path(DOCKER_CONFIG, directory=True, private=True)
    config = DOCKER_CONFIG / 'config.json'
    if config.exists() or config.is_symlink():
        trusted_path(config, private=True)
    birthday_runtime = read_birthday_runtime()
    with ExitStack() as locks:
        # The first lock also serializes against the previously installed archive helper.
        for name in ('undery-feature-deploy.lock', 'undery-container-deploy.lock'):
            fd = os.open('/run/lock/' + name, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            lock = locks.enter_context(os.fdopen(fd, 'w'))
            info = os.fstat(lock.fileno())
            require(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and not info.st_mode & 0o077,
                    'Deployment lock must be a root-private regular file')
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        print(json.dumps(deploy(DockerHost(birthday_runtime), *sys.argv[1:])))


if __name__ == '__main__':
    def interrupted(signum, frame):
        raise RuntimeError('Deployment interrupted')
    signal.signal(signal.SIGTERM, interrupted)
    main()
