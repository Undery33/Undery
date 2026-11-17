#!/usr/bin/env python3
"""Pick the newest live feature push in GitHub's activity order."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


API = 'https://api.github.com/repos/Undery33/Undery/activity'
PREFIX = 'refs/heads/feature/'
ZERO = '0' * 40


def activities():
    url = API + '?per_page=100&direction=desc'
    while url:
        target = urlsplit(url)
        if target.scheme != 'https' or target.netloc != 'api.github.com':
            raise ValueError('Unexpected activity pagination URL')
        request = Request(url, headers={'Accept': 'application/vnd.github+json',
                                        'User-Agent': 'Undery-Jenkins'})
        with urlopen(request, timeout=20) as response:
            page = json.load(response)
            link = response.headers.get('Link', '')
        if not isinstance(page, list):
            raise ValueError('Unexpected GitHub activity response')
        yield from page
        next_link = re.search(r'<([^>]+)>;\s*rel="next"', link)
        url = next_link.group(1) if next_link else None


def latest(events, completed=None):
    deleted = set()
    completed_at = completed.get('pushed_at') if completed else None
    for event in events:
        # GitHub orders this feed newest first. The ID is the checkpoint even
        # when a response or an existing checkpoint has no timestamp.
        occurred_at = event.get('timestamp') or event.get('pushed_at')
        if completed and str(event['id']) == str(completed['id']):
            break
        if occurred_at and completed_at and occurred_at < completed_at:
            break
        ref = event['ref']
        if not ref.startswith(PREFIX) or ref in deleted:
            continue
        sha = event['after']
        activity_type = event.get('activity_type') or event.get('push_type')
        if sha == ZERO or activity_type in ('branch_deletion', 'delete', 'branch_delete'):
            deleted.add(ref)
            continue
        branch = ref.removeprefix('refs/heads/')
        if (not re.fullmatch(r'feature/[A-Za-z0-9][A-Za-z0-9._/-]*', branch)
                or '..' in branch or not re.fullmatch(r'[0-9a-f]{40}', sha)):
            raise ValueError(f'Unsupported deployment ref or revision: {ref}')
        return {'id': event['id'], 'pushed_at': occurred_at, 'branch': branch, 'sha': sha}
    return None


def state_path():
    job = hashlib.sha256(os.environ['JOB_NAME'].encode()).hexdigest()
    return Path.home() / '.local' / 'state' / 'undery-jenkins' / (job + '.json')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=('select', 'current', 'complete'))
    parser.add_argument('event_file', type=Path)
    args = parser.parse_args()
    if args.action == 'complete':
        event = json.loads(args.event_file.read_text())
        state = state_path()
        state.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with tempfile.NamedTemporaryFile(mode='w', dir=state.parent, delete=False) as out:
            json.dump(event, out)
        os.replace(out.name, state)
        return
    completed = None
    if args.action == 'select' and state_path().exists():
        completed = json.loads(state_path().read_text())
    event = latest(activities(), completed)
    if args.action == 'current':
        selected = json.loads(args.event_file.read_text())
        matches = event and all(str(event[key]) == str(selected[key]) for key in ('id', 'branch', 'sha'))
        raise SystemExit(0 if matches else 3)
    if event:
        args.event_file.write_text(json.dumps(event) + '\n')
        print(event['branch'], event['sha'])


if __name__ == '__main__':
    main()
