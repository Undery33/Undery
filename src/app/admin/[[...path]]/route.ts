/** Fail closed: no admin capability exists until server-side GitHub auth is implemented. */
export function GET() {
  return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>관리자 기능 준비 중 | Undery</title><style>body{font:1rem/1.8 system-ui,sans-serif;background:#fafaf9;color:#202421;margin:0;padding:2rem}main{max-width:42rem;margin:12vh auto}h1{font-size:2rem;line-height:1.4}a{color:#256147}a:focus-visible{outline:3px solid #256147;outline-offset:4px}p{color:#535d56}</style></head><body><main id="main-content"><p>Undery · Admin</p><h1>관리자 기능은 아직 열리지 않았습니다.</h1><p>GitHub 로그인과 서버 측 관리자 권한 검증을 연결한 후 사용할 수 있습니다. 현재는 로그인, 콘텐츠 변경, 업로드 기능을 제공하지 않습니다.</p><a href="/">홈으로 돌아가기</a></main></body></html>`, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
