#!/bin/sh
# One-time host administrator setup. Jenkins never runs this installer.
set -eu
test "$(id -u)" -eq 0 || { echo '서버 관리자로 실행해야 합니다.' >&2; exit 1; }
source_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
id site-deploy >/dev/null
test -d /opt/personal-site/web/releases
test -L /opt/personal-site/web/current
test -f /etc/systemd/system/undery-web.service
test -x /usr/sbin/visudo
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT HUP INT TERM
printf '%s\n' 'site-deploy ALL=(root) NOPASSWD: /usr/local/sbin/undery-deploy-release' > "$temporary/sudoers"
/usr/sbin/visudo -cf "$temporary/sudoers"
backup_dir=/var/backups/undery-feature-deploy/$(date -u +%Y%m%dT%H%M%SZ)
for destination in /usr/local/sbin/undery-deploy-release /etc/sudoers.d/undery-feature-deploy; do
  test ! -L "$destination"
  if test -f "$destination"; then
    mkdir -p "$backup_dir"
    cp -p "$destination" "$backup_dir/$(basename "$destination")"
  fi
done
install -o root -g root -m 0755 "$source_dir/undery-deploy-release.py" /usr/local/sbin/undery-deploy-release
install -o root -g root -m 0440 "$temporary/sudoers" /etc/sudoers.d/undery-feature-deploy
echo '배포 도우미 설치 완료. Jenkins에서 DEPLOY=true로 실행할 수 있습니다.'
