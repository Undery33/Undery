import Link from "next/link";

export default function NotFound() {
  return <main id="main-content" className="shell error-page"><p className="eyebrow">404</p><h1>페이지를 찾을 수 없습니다.</h1><p>주소가 올바른지 확인해 주세요.</p><Link className="text-link" href="/">홈으로 돌아가기</Link></main>;
}
