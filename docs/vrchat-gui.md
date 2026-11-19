# Undery VRChat

`https://undery.link/vrchat`에서 제공하는 VRChat 소개 페이지입니다. 사이트 메인(`/`)은 같은 `main` 커밋의 Next.js 애플리케이션에서 제공합니다.

- 16:9 첫 화면에는 흰색과 노란색 배경 위에 해바라기 포스터, 커뮤니티 링크, 생일 이벤트와 PHOTO 제목이 보입니다. 아래로 스크롤하면 사진과 영상 미리보기가 이어집니다. 세로 화면에서는 콘텐츠가 화면 너비에 맞게 배치됩니다.
- 용 아이콘은 VRChat 그룹으로, 생일 배너는 같은 사이트의 `/birthday`로 연결됩니다.
- 사진과 영상의 ‘더 보기’는 각각 `/vrchat/photos.html`과 `/vrchat/videos.html`을 엽니다. 등록된 항목만 표시하며 날짜·태그·화질을 조합해 찾을 수 있습니다. 확대 화면에서는 양옆의 화살표로 앞뒤 항목을 보고, 바깥을 누르거나 Esc를 눌러 목록으로 돌아갑니다.
- `/vrchat/admin`에서 GitHub 소유자 계정으로 로그인하면 사진과 영상 여러 개를 선택하거나 끌어다 놓고 ‘올리기’를 누를 수 있습니다. 갤러리는 `/api/vrchat/media`에서 공개 목록을 읽습니다.
- CSS·JavaScript·이미지는 모두 `/vrchat/` 아래의 경로를 사용합니다. 메인 페이지의 자원 경로를 덮어쓰지 않습니다.

## 로컬 확인

정적 화면은 `npm run preview:vrchat`를 실행한 뒤 `http://127.0.0.1:4173/vrchat`에서 확인할 수 있습니다. 이 미리보기는 `dist/media.json`의 예시 목록을 반환합니다. 포트는 `PORT` 환경 변수로 변경할 수 있습니다. 관리자와 실제 업로드는 Next.js 앱과 PostgreSQL을 사용합니다.

운영에서는 `main`의 `dist/`가 같은 커밋의 앱과 함께 배포됩니다. [Jenkins 설정](jenkins.md)
