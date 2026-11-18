#!/bin/sh
# Host administrator bootstrap. Keep the production Docker daemon running.
set -eu
test "$(id -u)" -eq 0 || { echo '서버 관리자로 실행해야 합니다.' >&2; exit 1; }
for executable in dockerd-rootless-setuptool.sh rootlesskit newuidmap newgidmap slirp4netns; do
  command -v "$executable" >/dev/null || { echo "필수 패키지 누락: $executable" >&2; exit 1; }
done
ci_uid=$(id -u site-ci)
python3 - <<'PY'
from pathlib import Path
for name in ('subuid','subgid'):
    entries=[line.split(':') for line in (Path('/etc')/name).read_text().splitlines()]
    if not any(user=='site-ci' and int(count)>=65536 for user,start,count in entries):
        raise SystemExit('site-ci requires at least 65536 subordinate IDs in '+name)
PY
loginctl enable-linger site-ci
systemctl start "user@$ci_uid.service"
runuser -u site-ci -- env XDG_RUNTIME_DIR="/run/user/$ci_uid" \
  DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$ci_uid/bus" \
  /usr/bin/dockerd-rootless-setuptool.sh install --force
runuser -u site-ci -- env XDG_RUNTIME_DIR="/run/user/$ci_uid" \
  DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$ci_uid/bus" \
  systemctl --user enable --now docker.service
runuser -u site-ci -- env DOCKER_HOST="unix:///run/user/$ci_uid/docker.sock" \
  docker info --format '{{json .SecurityOptions}}'
echo 'site-ci 전용 rootless BuildKit 실행 환경 준비 완료'
