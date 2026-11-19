# VRChat 갤러리 운영 배포

`/vrchat/admin`은 기존 GitHub 관리자 세션을 사용합니다. 목록은 기존 PostgreSQL 데이터베이스의 `vrchat_gallery.media`에, 업로드 파일은 호스트의 `/var/lib/undery/vrchat-media`에 저장합니다. 정적 이미지로 제공하던 기존 사진 두 장은 최초 마이그레이션에서 같은 ID로 등록합니다.

## 호스트에서 한 번 적용하기

운영 서버의 신뢰할 수 있는 저장소 체크아웃에서 실행합니다. 아래 `REVISION`에는 검토한 배포 대상의 전체 40자리 SHA를 넣습니다. 현재 운영 웹·DB 컨테이너와 기존 관리자 인증 설정이 실행 중이어야 합니다. 이 단계에는 호스트 관리자의 sudo 권한이 필요합니다.

```sh
REVISION='검토한-40자리-커밋-SHA'
sudo python3 deploy/install-vrchat-gallery.py --revision "$REVISION" --check
sudo python3 deploy/install-vrchat-gallery.py --revision "$REVISION" --apply
```

점검은 체크아웃 리비전과 설치 입력 파일을 대조하고, 기존 HTTPS 설정과 실행 중인 앱이 접속한 DB·역할·기존 Docker 네트워크를 확인한 다음 같은 DB에 DBA로 읽기 접속합니다. 적용은 현재 배포와 잠금을 공유하며 다음 작업을 수행합니다.

1. 기존 갤러리 스키마가 있으면 `pg_dump`로 백업합니다. 마이그레이션과 기존 사진 시드는 재실행할 수 있습니다. 앱 역할에는 갤러리 스키마의 `USAGE` 및 미디어 표의 `SELECT, INSERT`만 부여합니다.
2. UID/GID `101:101`, 권한 `0700`의 저장 디렉터리를 준비합니다. 배포 도우미가 다음 후보·운영 컨테이너의 같은 경로에 이를 마운트하고 `VRCHAT_MEDIA_DIR`를 주입합니다. 컨테이너 메모리 한도는 업로드가 활성화된 호스트에서 512 MiB입니다.
3. 기존 HTTPS 가상호스트와 도우미를 `/var/backups/undery-vrchat-gallery-*`에 백업하고, 업로드 경로 전용 설정과 도우미를 설치합니다. `nginx -t` 성공 후 reload합니다. 설정 적용 오류가 나면 원래 파일을 복원합니다.

현재 운영 가상호스트는 `/etc/nginx/sites-available/undery.link`입니다. 주소·인증·DB가 확인된 환경과 달라 점검이 중단되면 출력된 원인을 확인합니다. 기존 HTTPS include가 이동한 환경에서는 canonical HTTPS `server` 안에 `include /etc/nginx/snippets/undery-vrchat-gallery.conf;`가 오도록 기존 메시지 include 위치를 확인하고 설치기를 적용합니다. 새 DB나 임시 파일 저장소를 지정해 점검을 우회하지 않습니다.

## 배포 후 확인

Jenkins가 같은 main 커밋의 이미지를 배포합니다. 후보, 운영 loopback, 외부 HTTPS에서 `HEAD /api/vrchat/media`가 JSON 200이어야 전환이 완료됩니다. 업로드는 사진 최대 32 MiB 또는 영상 최대 256 MiB로 제한되며, 두 nginx 계층의 정확한 `/api/vrchat/media`만 multipart 여유분을 포함한 257 MiB를 스트리밍합니다.

파일 하나의 전송 제한 시간은 4분 50초입니다. 두 프록시는 수신 중 다음 데이터가 120초 동안 도착하지 않으면 연결을 종료합니다. 전송을 마친 뒤 썸네일을 만들고 저장하는 시간은 파일 전송 제한과 별개입니다.

실제 관리자 계정으로 `/vrchat/admin`에 로그인한 뒤 사진과 영상 한 개씩 올립니다. 공개 목록과 사진/영상 페이지에서 표시되는지, 원본과 썸네일이 열리는지, 영상 탐색 시 `Range` 요청이 206인지 확인합니다. 다음 컨테이너 배포 뒤 동일한 ID와 URL을 다시 열어 파일 지속성을 확인합니다.

## 백업과 장애 확인

업로드 중지 또는 일관된 스냅샷 시점에서 DB의 `vrchat_gallery` 스키마와 데이터 디렉터리를 함께 백업합니다. 각 완료 항목의 디렉터리에는 원본과 썸네일이 들어 있고 `.upload-*`는 업로드 중 임시 작업 디렉터리입니다. 복구 전에 현재 데이터의 백업을 확보하고, 같은 시점의 메타데이터와 파일을 복원한 뒤 소유권과 실제 URL을 확인합니다.

| 증상 | 확인할 항목 |
| --- | --- |
| 외부에서 413 | 호스트의 정확한 업로드 location 및 컨테이너 제한, 실제 파일 크기 |
| 목록 503 | 기존 DB 연결, 마이그레이션, 앱 역할의 스키마·표 권한 |
| 목록은 정상이나 업로드 실패 | 관리자 세션·CSRF, 데이터 마운트와 UID 101 쓰기 권한, 디스크 여유 공간, ffmpeg/ffprobe |
| 재배포 후 파일이 열리지 않음 | 이전·현재 컨테이너의 동일한 호스트 마운트와 DB의 미디어 ID |
