import type { Metadata } from "next";
import GuestbookHero from "./guestbook-hero";
import styles from "./guestbook.module.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: "생일 메시지", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function BirthdayMemoPage() {
  return (
    <main id="main-content" className={styles.page}>
      <GuestbookHero />
    </main>
  );
}
