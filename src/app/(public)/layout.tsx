import { SiteHeader } from "@/components/site-header";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <><SiteHeader /><main id="main-content" className="shell main-content">{children}</main><footer className="site-footer shell">Undery · 기록을 위한 공간</footer></>;
}
