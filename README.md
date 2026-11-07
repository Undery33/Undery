# Undery VRChat

`https://undery.link/vrchat`에서 제공하는 VRChat 소개 페이지입니다. 사이트 메인(`/`)은 `feature/site-foundation`의 기존 애플리케이션에서 제공합니다.

- 가로 데스크톱 화면은 1920×1080을 기준으로 한 16:9 구도를 사용합니다. 화면 크기가 달라도 이미지의 원래 비율을 유지합니다.
- 휴대폰과 세로 태블릿은 기존 베이지·골드 포스터 구도를 유지합니다. 메뉴와 닫기 버튼은 최소 44px 터치 영역을 사용합니다.
- Profile·Pictures·Gallery는 키보드와 터치로 열 수 있는 대화상자입니다. 모바일에서 긴 내용은 대화상자 안에서 스크롤합니다.
- CSS·JavaScript·이미지는 모두 `/vrchat/` 아래의 경로를 사용합니다. 메인 페이지의 자원 경로를 덮어쓰지 않습니다.

## 로컬 확인

Node.js 18 이상에서 `npm start`를 실행하고 `http://127.0.0.1:4173/vrchat`을 엽니다. 포트는 `PORT` 환경 변수로 변경할 수 있습니다. 미리보기 서버는 VRChat 경로만 제공하며 `/`는 제공하지 않습니다.

## 배포

Jenkins `Undery_Feature`에서 `FEATURE_BRANCH=feature/vrchat-web-gui`를 선택합니다. 배포 설정과 Dockerfile은 `feature/site-foundation`에서 읽고 이 브랜치의 `dist/`를 VRChat 정적 자원으로 패키징합니다. `DEPLOY=true`는 BuildKit 이미지 검사 후 GHCR 게시와 운영 배포를 수행합니다. `main` 병합은 필요하지 않습니다.
