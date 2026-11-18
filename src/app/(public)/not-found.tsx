import Link from "next/link";

// PublicLayout already owns the main landmark and skip-link target.
export default function PublicNotFound() {
  return <section className="error-page" aria-labelledby="not-found-heading"><p className="eyebrow">404</p><h1 id="not-found-heading">페이지를 찾을 수 없습니다.</h1><p>주소가 올바른지 확인해 주세요.</p><Link className="text-link" href="/computer">기술 글 목록으로 돌아가기</Link></section>;
}
