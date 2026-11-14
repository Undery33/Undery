#!/usr/bin/env python3
"""Select publication mode from Jenkins build cause and checkout identities."""
import argparse
import re


AUTO_BRANCH = 'feature/vrchat-web-gui'


def deployment_mode(branch, commit, previous, manual=False, scm=False):
    if not re.fullmatch(r'feature/[A-Za-z0-9][A-Za-z0-9._/-]*', branch) or '..' in branch:
        raise ValueError('Only feature branches may be deployed')
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('The checked-out source commit must be a full Git SHA')
    if manual:
        return 'manual'
    if (scm and branch == AUTO_BRANCH and re.fullmatch(r'[0-9a-f]{40}', previous)
            and previous != commit):
        return 'auto'
    return 'check'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--branch', required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--previous', default='')
    parser.add_argument('--manual', choices=('true', 'false'), required=True)
    parser.add_argument('--scm', choices=('true', 'false'), required=True)
    args = parser.parse_args()
    print(deployment_mode(args.branch, args.commit, args.previous,
                          manual=args.manual == 'true', scm=args.scm == 'true'))


if __name__ == '__main__':
    main()
