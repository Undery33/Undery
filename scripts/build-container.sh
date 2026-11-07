#!/bin/sh
# Build only in the unprivileged site-ci Docker daemon, never /var/run/docker.sock.
set -eu
context=${1:?container context required}
artifacts=${2:?artifact directory required}
export DOCKER_HOST="unix:///run/user/$(id -u)/docker.sock"
unset DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
security=$(docker info --format '{{json .SecurityOptions}}')
printf '%s' "$security" | python3 -c 'import json,sys; assert "name=rootless" in json.load(sys.stdin), "site-ci rootless Docker is required"'
docker buildx version
mkdir -p "$artifacts"
builder="undery-$(id -u)-$(date +%s)-$$"
cleanup() { docker buildx rm "$builder" >/dev/null 2>&1 || true; }
trap cleanup EXIT HUP INT TERM
docker buildx create --name "$builder" --driver docker-container --bootstrap >/dev/null
image=$(python3 - "$context/health.json" <<'PY'
import json,re,sys
v=json.load(open(sys.argv[1]))
for field in ('commit','pipelineCommit'):
    if not re.fullmatch(r'[a-f0-9]{40}',v[field]): raise ValueError(field)
print('ghcr.io/undery33/undery:sha-'+v['commit']+'-pipeline-'+v['pipelineCommit'])
PY
)
docker buildx build --builder "$builder" --pull --load --platform linux/amd64 \
  --build-arg "SOURCE_COMMIT=$BUILD_COMMIT" --build-arg "SOURCE_BRANCH=$SOURCE_BRANCH" \
  --build-arg "PIPELINE_COMMIT=$PIPELINE_COMMIT" --tag "$image" "$context"
python3 "$(dirname "$0")/verify-container.py" --image "$image" --metadata "$context/health.json"
printf '%s\n' "$image" > "$artifacts/image-tag.txt"
docker image inspect --format '{{.Id}}' "$image" > "$artifacts/tested-image-id.txt"
cp "$context/health.json" "$artifacts/build-info.json"
