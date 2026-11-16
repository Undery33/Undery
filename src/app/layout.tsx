import type { Metadata } from "next";
import { site } from "@/lib/site";
import { computerThemeScript } from "@/lib/computer-theme";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: site.name, template: `%s | ${site.name}` },
  description: site.description,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" data-computer-theme="light" suppressHydrationWarning>
      <head><script id="computer-theme" dangerouslySetInnerHTML={{ __html: computerThemeScript }} /></head>
      <body><a className="skip-link" href="#main-content">본문으로 건너뛰기</a>{children}</body>
    </html>
  );
}
