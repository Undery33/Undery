#!/bin/sh
set -eu
set +x
artifacts=${1:?artifact directory required}
export DOCKER_HOST="unix:///run/user/$(id -u)/docker.sock"
unset DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
registry_config=$(mktemp -d)
chmod 700 "$registry_config"
export DOCKER_CONFIG="$registry_config"
trap 'rm -rf "$registry_config"' EXIT HUP INT TERM
image=$(cat "$artifacts/image-tag.txt")
python3 - "$image" <<'PY'
import re,sys
assert re.fullmatch(r'ghcr.io/undery33/undery:sha-[a-f0-9]{40}-pipeline-[a-f0-9]{40}',sys.argv[1])
PY
test "$(docker image inspect --format '{{.Id}}' "$image")" = "$(cat "$artifacts/tested-image-id.txt")"
printf '%s' "$GHCR_PASSWORD" | docker login ghcr.io --username "$GHCR_USERNAME" --password-stdin >/dev/null
docker push "$image"
docker image inspect --format '{{json .RepoDigests}}' "$image" > "$artifacts/repo-digests.json"
python3 - "$artifacts" <<'PYCODE'
import json,re,sys
from pathlib import Path
p=Path(sys.argv[1])
refs=[x for x in json.loads((p/'repo-digests.json').read_text()) if re.fullmatch(r'ghcr.io/undery33/undery@sha256:[a-f0-9]{64}',x)]
if len(refs)!=1: raise ValueError('Expected one immutable GHCR digest')
(p/'image-digest.txt').write_text(refs[0]+'\n')
metadata=json.loads((p/'build-info.json').read_text())
(p/'release.json').write_text(json.dumps({**metadata,'image':refs[0]},indent=2)+'\n')
(p/'repo-digests.json').unlink()
print('Published verified image: '+refs[0])
PYCODE
