"""Archive only the standalone runtime. No credentials or source .env files."""
import hashlib
import json
from pathlib import Path
import re
import tarfile


def package(root=Path('.next/standalone'), output=Path('artifacts/release.tar.gz')):
    root = root.resolve(strict=True)
    metadata = json.loads((root / 'build-info.json').read_text())
    if (metadata.get('repository') != 'Undery33/Undery'
            or not re.fullmatch(r'[a-f0-9]{40}', metadata.get('commit', ''))
            or not re.fullmatch(r'feature/[A-Za-z0-9][A-Za-z0-9._/-]*', metadata.get('branch', ''))):
        raise ValueError('Release requires an Undery feature branch and full commit SHA')
    for required in ('server.js', '.next/BUILD_ID', 'content/computer', '.next/static'):
        if not (root / required).exists():
            raise ValueError(f'Incomplete runtime: {required}')
    output.parent.mkdir(parents=True, exist_ok=True)
    # Dereference dependency symlinks into regular files, never paths outside runtime.
    with tarfile.open(output, 'w:gz', dereference=True) as archive:
        for file in sorted(root.rglob('*')):
            relative = file.relative_to(root)
            if any(part.startswith('.env') for part in relative.parts):
                raise ValueError('Environment file in runtime')
            if not file.resolve().is_relative_to(root):
                raise ValueError('Runtime symlink escapes standalone directory')
            if relative.parts[:2] == ('.next', 'cache') or file.is_dir():
                continue
            if not file.is_file():
                raise ValueError('Special file in runtime')
            archive.add(file, arcname=relative.as_posix(), recursive=False)
    with output.open('rb') as artifact:
        sha = hashlib.file_digest(artifact, 'sha256').hexdigest()
    output.with_suffix(output.suffix + '.sha256').write_text(f'{sha}  {output.name}\n')
    output.with_name('release.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(json.dumps({**metadata, 'sha256': sha}))


if __name__ == '__main__':
    package()
