import Link from "next/link";
import { publicSections } from "@/lib/site";

export default function HomePage() {
  return (
    <>
      <section className="hero"><p className="eyebrow">Personal archive</p><h1>배우고, 즐기고,<br />기록하는 공간.</h1><p>기술 이야기부터 좋아하는 것들까지.<br />하나씩 정리해 나가는 Undery의 개인 공간입니다.</p></section>
      <section aria-labelledby="sections-heading"><div className="section-heading"><h2 id="sections-heading">둘러보기</h2><span>03 spaces</span></div>
        <div className="section-grid">{publicSections.map((section, index) => <Link className="section-card" href={section.href} key={section.href}><div className="card-top"><span className="card-number">0{index + 1}</span><span className="badge">{section.status}</span></div><h3>{section.label} <span aria-hidden="true">↗</span></h3><p>{section.description}</p></Link>)}</div>
      </section>
      <p className="foundation-note">현재는 기본 구조를 준비하는 단계입니다. 화면 디자인과 콘텐츠는 이후에 다듬습니다.</p>
    </>
  );
}
