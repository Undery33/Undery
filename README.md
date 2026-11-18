# Undery

기술과 취미를 기록하는 개인 웹사이트입니다. `/`는 기존 Next.js 메인 화면을 제공하고 `/vrchat`에 같은 커밋의 정적 GUI를 제공합니다. Jenkins가 BuildKit으로 Next.js·Node.js·Nginx·VRChat GUI를 하나의 이미지로 빌드한 뒤 GHCR digest로 배포합니다. 실행·설정 방법은 [컨테이너 배포 문서](docs/container-deployment.md)를 기준으로 합니다.

- 저장소: [Undery33/Undery](https://github.com/Undery33/Undery) (공개)
- 기반: Next.js App Router, React, TypeScript, 파일 기반 Markdown
- Jenkins는 `main` 변경을 확인하고 같은 커밋에 있는 Next.js 앱과 VRChat GUI를 함께 배포합니다.
- 모든 작업은 `feature/site-foundation`, `feature/article-search`처럼 목적이 드러나는 `feature/` 브랜치에서 진행합니다. `codex/` 접두사와 무작위 코드 이름은 사용하지 않습니다.

## 현재 구현

| 경로 | 상태 |
| --- | --- |
| `/` | Computer, VRChat, Valorant 진입점 |
| `/posts`, `/posts/[slug]` | 일반 게시글 목록·검색과 글 본문. 메인 POST에는 최근 공개 글 5개를 표시합니다. |
| `/computer` | 장비 6개의 3D 네트워크 구성도와 분류별 글 목록, URL 기반 검색(`q`)·태그(`tag`)·분야(`category`) 필터 |
| `/computer/[slug]` | 기술 문서, Markdown 렌더링, VLAN·라우팅 3D 및 DNS·DHCP 실습, 없는 글은 404 |
| `/vrchat` | 해바라기 포스터와 생일 이벤트, VRChat 그룹·Discord·X 링크, PHOTO·VIDEOS 갤러리 |
| `/valorant` | 준비 중 안내. 미디어 게시·댓글 없음 |
| `/birthday/memo` | 생일 사진과 VRChat 월드에 보낼 축하 메시지 작성 폼 |
| `/birthday/memo/admin` | 기존 GitHub 관리자 인증으로 메시지 작성·수정·검색·숨김·휴지통·복구 |
| `/admin`, `/admin/*` | 인증 설정 시 `/admin`은 메시지 관리로 이동. 미설정 및 미지원 하위 경로는 503 |
| `/portfolio` | 공용 메뉴와 분리한 소개 페이지 틀. 직접 URL로 접근 가능, `noindex` 적용 |
| `/api/health` | 컨테이너의 메인 앱 상태를 확인한 뒤 GUI·배포 설정 커밋 식별자 반환. `no-store` 적용 |

예제 글은 실제 개인 이력이나 활동이 아니며 화면에 예제로 표시됩니다.

### Computer 화면

[성열의 컴퓨터공학](https://cs.yeolyi.com/)의 층을 나눈 모형과 재질 표현을 참고해 장비를 모델링했습니다. 첫 화면에서는 Router, ASA, Switch와 스위치에 연결된 Server, Linux, Windows Server를 한눈에 볼 수 있습니다. 장비 그림이나 소개 아래의 분류 카드를 선택하면 해당 기술 글을 볼 수 있습니다. Linux를 선택하면 해당 모니터만 확대하여 Kubernetes(K8s), Jenkins, Docker의 구성 요소와 연결 관계를 화면 안에 표시합니다.

스크롤 순서는 전체 구성도 → Router → ASA → Switch → Server → Linux → Docker → Jenkins → Kubernetes → Windows Server입니다. 장비 단계에서는 왼쪽에 확대된 장비와 노란색(`#FDC41F`) 랜선, 오른쪽에 해당 장비의 설명이 나옵니다. Router는 Cisco ISR 4331의 1U 섀시와 후면 네트워크 포트를 기준으로 모델링했습니다. [Cisco 공식 섀시 도면](https://www.cisco.com/c/en/us/td/docs/routers/access/4400/hardware/installation/guide4400-4300/C4400_isr/Overview.html)

넓은 화면에서는 Router·ASA·Switch가 왼쪽에서 오른쪽으로 이어지고, Server·Linux·Windows Server는 오른쪽 한 열에 놓입니다. 좁은 화면에서는 두 그룹이 위아래로 나뉩니다. Switch의 세 UTP 케이블은 일정 간격으로 나란히 진행하고 방향을 바꾸는 부분에서만 둥글게 꺾입니다. Linux와 Windows Server의 랜선은 각각 모니터 왼쪽에 있는 본체의 후면 포트에 꽂힙니다.

Linux 모니터 안에서 아키텍처 그림을 선택하면 해당 그림이 확대되고 옆에 그 기술의 글이 열립니다. Docker, Jenkins, Kubernetes의 글은 각각 `content/computer/docker.md`, `content/computer/jenkins.md`, `content/computer/kubernetes.md`에서 작성합니다. 수정한 본문은 구성도 옆과 각 글의 개별 주소에 함께 반영됩니다.

장비 소개 다음에는 분류 카드와 글 목록이 있습니다. 검색창에서 제목·요약·본문·태그를 검색할 수 있습니다. 검색어·태그·분야는 교집합으로 적용되고 URL에 유지됩니다. 분야가 없는 기존 예제는 전체 목록과 전체 검색에서 확인할 수 있습니다.

Router 분류에는 라우팅, Switch에는 VLAN, Server에는 DNS와 DHCP 실습이 있습니다.

| 기술 | 경로 | 직접 확인할 동작 |
| --- | --- | --- |
| VLAN | `/computer/vlan` | 3D 스위치·단말 사이의 액세스/트렁크 프레임 전달과 VLAN 태그 |
| 라우팅 | `/computer/routing` | Cisco 라우팅 종류 검색, 정적·RIP·OSPF·EIGRP·IS-IS·BGP·PBR의 3D 경로 선택과 최장 프리픽스 일치 |
| DNS | `/computer/dns` | 재귀 조회·위임 응답·권한 응답·TTL 캐시 |
| DHCP | `/computer/dhcp` | Discover·Offer·Request·ACK와 주소 임대 |

각 예제는 브라우저 안에서 동작하는 시뮬레이션입니다. 외부 DNS 조회나 DHCP 패킷 전송을 수행하지 않습니다. 3D 모델은 Three.js로 로컬 생성하며 외부 모델 파일을 내려받지 않습니다. WebGL을 사용할 수 없으면 같은 입체 장면을 SVG 소프트웨어 렌더러로 표시하며 회전·확대·프레임 이동을 유지합니다. 글마다 공식 기술 문서 출처를 제공합니다. 허용된 네 글의 표식만 저장소에 포함된 컴포넌트로 연결하며 Markdown의 임의 HTML·스크립트는 실행하지 않습니다.

라우팅 문서는 경로 출처, IPv4·IPv6 프로토콜, 정책과 특수 목적 기능을 검색 가능한 분류로 제공합니다. 대표 7가지 방식의 실습에서는 동일한 목적지의 다음 홉 선택, 로컬·원격 링크 장애, 플로팅 정적 경로, SPF·ECMP, EIGRP classic metric, BGP LOCAL_PREF·AS_PATH, PBR 조건을 비교합니다. 경로를 구성하는 단계와 데이터 패킷 전달을 구분하며 전체 프로토콜의 상태 머신이나 수렴 시간을 재현하지 않습니다. 기존 최장 프리픽스 실습은 별도 화면으로 유지합니다.

Computer의 상단 공통 헤더는 표시하지 않으며 오른쪽 위 해·달 버튼으로 라이트·다크 모드를 선택합니다. 첫 방문에는 운영체제 선호를 따르고 선택 이후에는 브라우저에 저장합니다. 검색·글 이동과 새로고침 후에도 선택을 유지합니다.

**공개 범위 주의:** `noindex`와 메뉴에서 링크를 빼는 것은 접근 제어가 아닙니다. 포트폴리오는 로그인 없이 열 수 있습니다. `draft: true`는 웹사이트에서만 글을 숨깁니다. 공개 GitHub 저장소에 커밋한 초안과 변경 이력은 누구나 읽을 수 있으므로 비밀값·비공개 정보를 넣지 않습니다.

## 로컬 실행

Node.js 24 이상과 npm이 필요합니다. `.nvmrc`는 24를 지정합니다.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

기본 주소는 `http://localhost:3000`입니다. `.env.local`은 커밋하지 않습니다.

이 명령은 메인 Next.js 앱만 실행합니다. `/vrchat` GUI 연결은 컨테이너 Nginx에서 수행하므로 메인 앱 단독 개발 서버의 준비 중 화면과 구분합니다. 두 화면이 연결된 상태는 [컨테이너 빌드·검사](docs/container-deployment.md)로 확인합니다.

## 검증 및 프로덕션 모드 실행

```sh
npm run check
npm run build
npm run test:integration
npm start
```

`check`는 ESLint, Next.js 타입 생성과 TypeScript 검사(`next typegen && tsc --noEmit`), Vitest를 차례로 실행합니다. `build`는 빌드 식별자와 standalone 런타임을 생성하고 CSS·Markdown을 복사합니다. `test:integration`은 소스 checkout과 분리한 standalone 디렉터리에서 loopback 전용 임시 서버를 띄워 HTTP smoke test를 실행한 뒤 종료합니다. 먼저 `build`가 필요합니다. 배포 도우미의 별도 검사는 `npm run test:deploy`입니다.

`npm start`로 서버를 유지하며 확인할 때는 다른 터미널에서 다음 명령을 사용할 수 있습니다.

```sh
SMOKE_BASE_URL=http://localhost:3000 npm run test:smoke
```

Smoke test는 서버를 자동으로 시작하지 않습니다. `SMOKE_BASE_URL`을 생략하면 `http://localhost:3000`을 사용합니다. 운영에 사용할 때는 **빌드 전에** `SITE_URL`을 실제 HTTPS 도메인으로 설정해야 합니다. 기본 localhost 값으로 만든 sitemap을 운영에 사용하지 않습니다.

의존성 보안 검사는 `npm audit`로 별도 확인합니다. HTTP 검사와 브라우저의 레이아웃·키보드 동작 검증은 각각 수행합니다.

## 아직 하지 않은 작업

- 메시지 관리 외의 다른 콘텐츠 관리자 작성 화면
- VRChat·Valorant 미디어 게시, 업로드와 방문자 댓글
- 최종 디자인, 실제 포트폴리오·운영 콘텐츠

생일 메시지는 기존 PostgreSQL과 기존 GitHub 관리자 인증을 재사용합니다. 업로드 저장소와 다른 콘텐츠 관리 기능은 연결하지 않았습니다. 배포는 `main`을 기준으로 진행합니다. [Jenkins 설정과 배포 도우미 설치](docs/jenkins.md)

## 문서

- [구조와 보안 경계](docs/architecture.md)
- [실행·검증·향후 운영 절차](docs/operations.md)
- [VRChat GUI와 로컬 미리보기](docs/vrchat-gui.md)
- [Markdown 글 작성](docs/content-authoring.md)
- [메시지 관리·적용·복구](docs/birthday-message-management.md)
- [기존 관리자 로그인 연결](docs/admin-auth.md)
- [main 브랜치 Jenkins 빌드·배포](docs/jenkins.md)

