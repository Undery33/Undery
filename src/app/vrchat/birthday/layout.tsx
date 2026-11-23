import type { Metadata } from "next";
import "./birthday.css";

export const metadata: Metadata = { title: "Birthday", robots: { index: false, follow: false } };

export default function BirthdayLayout({ children }: { children: React.ReactNode }) {
  return <main id="main-content" className="birthday shell">{children}</main>;
}
