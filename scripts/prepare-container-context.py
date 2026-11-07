#!/usr/bin/env python3
"""Build an isolated Docker context from verified, tracked static GUI files."""
import argparse
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import tempfile
from urllib.parse import unquote, urlsplit

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MAX_TOTAL_BYTES = 128 * 1024 * 1024
MAX_FILES = 2000
SHA = re.compile(r'[a-f0-9]{40}')
BRANCH = re.compile(r'feature/[A-Za-z0-9][A-Za-z0-9._/-]*')
CSS_URL = re.compile(r'url\(\s*([\'"]?)(.*?)\1\s*\)', re.IGNORECASE)
CSS_IMPORT = re.compile(r'@import\s+([\'"])(.*?)\1', re.IGNORECASE)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def git(checkout, *arguments):
    return subprocess.run(['git', '-C', str(checkout), *arguments],
                          check=True, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE).stdout


def regular_file(root, relative):
    """Reject symlinks at every level, including tracked symlink ancestors."""
    current = root
    for index, part in enumerate(relative.parts):
        current = current / part
        info = current.lstat()
        expected = stat.S_ISREG if index == len(relative.parts) - 1 else stat.S_ISDIR
        require(expected(info.st_mode), f'Only regular files and directories allowed: {relative}')
    return current


def tracked_files(checkout, commit, pathspec):
    require(git(checkout, 'rev-parse', 'HEAD').decode().strip() == commit,
            'Checkout HEAD does not match the selected commit')
    entries = git(checkout, 'ls-tree', '-r', '-z', '--full-tree', commit, '--', pathspec)
    result = {}
    for entry in entries.split(b'\0'):
        if not entry:
            continue
        description, raw_name = entry.split(b'\t', 1)
        mode, kind, object_sha = description.decode('ascii').split(' ')
        name = raw_name.decode('utf-8')
        path = PurePosixPath(name)
        require(mode in ('100644', '100755') and kind == 'blob', f'Unsafe tracked type: {name}')
        require(not path.is_absolute() and str(path) == name
                and '..' not in path.parts and '\\' not in name
                and not any(ord(char) < 32 for char in name)
                and not any(part.startswith('.') for part in path.parts),
                f'Unsafe or hidden tracked path: {name}')
        source_file = regular_file(checkout, path)
        data = source_file.read_bytes()
        require(data == git(checkout, 'cat-file', 'blob', object_sha),
                f'Tracked file differs from selected commit: {name}')
        result[name] = data
    return result


def reference_target(reference, relative, files):
    """Only references to shipped files or in-page anchors may enter the image."""
    reference = reference.strip()
    if not reference or reference.startswith('#'):
        return
    parsed = urlsplit(reference)
    require(not parsed.scheme and not parsed.netloc, f'External reference in {relative}: {reference}')
    path = unquote(parsed.path)
    require(path and not path.startswith('/') and '\\' not in path
            and not any(ord(char) < 32 for char in path),
            f'Invalid local reference in {relative}: {reference}')
    parts = PurePosixPath(path).parts
    require('..' not in parts and not any(part.startswith('.') for part in parts),
            f'Outside or hidden reference in {relative}: {reference}')
    target = str(PurePosixPath(relative).parent / PurePosixPath(path))
    require(target in files, f'Reference is not a tracked dist file: {relative} -> {reference}')


def css_references(text):
    return [match.group(2) for pattern in (CSS_URL, CSS_IMPORT) for match in pattern.finditer(text)]


class AssetReferences(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.references = []
        self.in_style = False

    def handle_starttag(self, tag, attrs):
        require(tag != 'base', 'HTML base elements are not allowed')
        self.in_style = tag == 'style'
        for key, value in attrs:
            if value is None:
                continue
            if key in ('src', 'href', 'poster', 'action', 'data'):
                self.references.append(value)
            elif key == 'srcset':
                self.references.extend(item.strip().split()[0] for item in value.split(',') if item.strip())
            elif key == 'style':
                self.references.extend(css_references(value))

    def handle_endtag(self, tag):
        if tag == 'style':
            self.in_style = False

    def handle_data(self, data):
        if self.in_style:
            self.references.extend(css_references(data))


def validate_assets(files):
    require('dist/index.html' in files and 'dist/styles.css' in files and 'dist/app.js' in files,
            'GUI must include tracked dist/index.html, dist/styles.css and dist/app.js')
    require(len(files) <= MAX_FILES and sum(map(len, files.values())) <= MAX_TOTAL_BYTES,
            'Static GUI exceeds the context size limit')
    for name, data in files.items():
        require(PurePosixPath(name).parts[0] == 'dist', 'Files must be inside dist')
        references = []
        if name.endswith('.html'):
            parser = AssetReferences()
            parser.feed(data.decode('utf-8'))
            references = parser.references
        elif name.endswith('.css'):
            references = css_references(data.decode('utf-8'))
        for reference in references:
            reference_target(reference, name, files)


def prepare_context(source, output, commit, branch, pipeline_commit, infrastructure=PROJECT_ROOT):
    require(bool(SHA.fullmatch(commit)) and bool(SHA.fullmatch(pipeline_commit)),
            'Full lowercase commit SHAs are required')
    require(bool(BRANCH.fullmatch(branch)) and '..' not in branch, 'Only feature/ branches are allowed')
    source = Path(source).resolve(strict=True)
    infrastructure = Path(infrastructure).resolve(strict=True)
    output = Path(output).resolve()
    require(not output.exists(), 'Output must not exist; use a fresh context directory')
    require(not output.is_relative_to(source / 'dist'), 'Output must be outside source dist')

    files = tracked_files(source, commit, 'dist')
    validate_assets(files)
    infrastructure_files = {}
    for path in ('Dockerfile', 'deploy/container-nginx.conf'):
        selected = tracked_files(infrastructure, pipeline_commit, path)
        require(path in selected, f'Missing tracked infrastructure file: {path}')
        infrastructure_files[path] = selected[path]
    # .dockerignore is intentionally hidden, so verify its exact blob separately.
    ignore = infrastructure / '.dockerignore'
    require(stat.S_ISREG(ignore.lstat().st_mode), '.dockerignore must be a regular file')
    ignore_data = ignore.read_bytes()
    require(ignore_data == git(infrastructure, 'show', pipeline_commit + ':.dockerignore'),
            '.dockerignore differs from selected pipeline commit')

    metadata = {'status': 'ok', 'repository': 'Undery33/Undery', 'commit': commit,
                'branch': branch, 'pipelineCommit': pipeline_commit}
    manifest = {name.removeprefix('dist/'): hashlib.sha256(data).hexdigest()
                for name, data in sorted(files.items())}
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix='.container-context-', dir=output.parent))
    try:
        for name, data in {**files, 'Dockerfile': infrastructure_files['Dockerfile'],
                           'nginx.conf': infrastructure_files['deploy/container-nginx.conf'],
                           '.dockerignore': ignore_data,
                           'health.json': (json.dumps(metadata, sort_keys=True) + '\n').encode(),
                           'asset-manifest.json': (json.dumps(manifest, sort_keys=True, indent=2) + '\n').encode()}.items():
            target = temporary / name
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
            target.write_bytes(data)
            target.chmod(0o644)
        temporary.chmod(0o755)
        os.rename(temporary, output)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    return metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ('source', 'output', 'commit', 'branch', 'pipeline-commit'):
        parser.add_argument('--' + option, required=True)
    args = parser.parse_args()
    result = prepare_context(args.source, args.output, args.commit, args.branch, args.pipeline_commit)
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    main()
