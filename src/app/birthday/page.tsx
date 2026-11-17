import type { Metadata } from "next";
import Image from "next/image";
import styles from "./birthday.module.css";
import poster from "./poster.webp";

export const metadata: Metadata = {
  title: "Undery #26 생일 파티",
  description: "11월 22일 오후 4시 5분, VRChat에서 열리는 Undery의 생일 파티 포스터입니다.",
};

export default function BirthdayPage() {
  return (
    <main id="main-content" className={styles.page} tabIndex={-1}>
      <h1 className={styles.visuallyHidden}>Undery #26 생일 파티</h1>
      <div className={styles.artwork}>
        <Image
          src={poster}
          alt="금빛 꽃과 금발 캐릭터가 그려진 포스터. VRChat 생일 파티, 11월 22일 오후 4시 5분. Discord는 Undery. 포스터에 GoongUngBbang, お尻×, RESTART가 적혀 있습니다."
          className={styles.poster}
          unoptimized
          preload
        />
        <a className={`${styles.posterLink} ${styles.memoLink}`} href="/birthday/memo">
          <span className={styles.memoLabel}>축하 메시지</span>
        </a>
        <a
          className={`${styles.posterLink} ${styles.worldLink}`}
          href="https://vrchat.com/home/world/wrld_59673787-ac01-41bb-8d81-568a17ca6993/info"
          aria-label="VRChat 월드 구경하기"
        />
      </div>
    </main>
  );
}
