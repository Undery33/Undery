#!/bin/sh
# One-time administrator setup. Does not start Docker containers or stop the website.
set -eu
test "$(id -u)" -eq 0 || { echo '서버 관리자로 실행해야 합니다.' >&2; exit 1; }
source_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
id site-deploy >/dev/null
test -x /usr/bin/docker
test -x /usr/sbin/visudo
test -f /etc/systemd/system/undery-web.service
test ! -L /etc/undery-ghcr
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT HUP INT TERM
printf '%s\n' 'site-deploy ALL=(root) NOPASSWD: /usr/local/sbin/undery-deploy-container' > "$temporary/sudoers"
/usr/sbin/visudo -cf "$temporary/sudoers"
backup_dir=/var/backups/undery-container-deploy/$(date -u +%Y%m%dT%H%M%SZ)
for destination in /usr/local/sbin/undery-deploy-container /etc/sudoers.d/undery-container-deploy; do
  test ! -L "$destination"
  if test -f "$destination"; then
    mkdir -p "$backup_dir"
    cp -p "$destination" "$backup_dir/$(basename "$destination")"
  fi
done
install -d -o root -g root -m 0700 /etc/undery-ghcr
install -o root -g root -m 0755 "$source_dir/undery-deploy-container.py" /usr/local/sbin/undery-deploy-container
install -o root -g root -m 0440 "$temporary/sudoers" /etc/sudoers.d/undery-container-deploy
echo '컨테이너 배포 도우미 설치 완료. 기존 웹 서비스는 그대로 실행 중입니다.'
echo '비공개 GHCR 이미지는 관리자가 /etc/undery-ghcr에 read:packages 전용 로그인을 별도로 설정해야 합니다.'
