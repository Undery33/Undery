import Link from "next/link";
import { publicSections } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link className="wordmark" href="/" aria-label="Undery 홈">Undery<span aria-hidden="true">.</span></Link>
        <nav aria-label="주 메뉴">
          {publicSections.map((section) => <Link key={section.href} href={section.href}>{section.label}</Link>)}
        </nav>
      </div>
    </header>
  );
}
