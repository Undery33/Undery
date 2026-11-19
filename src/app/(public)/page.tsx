import Image from "next/image";
import Link from "next/link";
import { HomePosts } from "@/components/home/home-posts";
import { HomeStack } from "@/components/home/home-stack";
import equipment from "@/components/home/assets/cisco-equipment.png";
import discord from "@/components/home/assets/discord.png";
import github from "@/components/home/assets/github.png";
import instagram from "@/components/home/assets/instagram.png";
import monogram from "@/components/home/assets/undery-mark.png";
import valorant from "@/components/home/assets/valorant.webp";
import vrchat from "@/components/home/assets/vrchat.webp";
import x from "@/components/home/assets/x.png";
import styles from "@/components/home/home.module.css";

const profiles = [
  { name: "Discord", href: "https://discord.gg/gub", icon: discord },
  { name: "Instagram", href: "https://instagram.com/_undery.pth/", icon: instagram },
  { name: "GitHub", href: "https://github.com/Undery33", icon: github },
  { name: "X", href: "https://x.com/VRC_UDR", icon: x },
];

export default function HomePage() {
  return (
    <div className={styles.page}>
      <header className={styles.masthead}>
        <Image className={styles.monogram} src={monogram} alt="" loading="eager" unoptimized />
        <h1 className={styles.wordmark}>UNDERY</h1>
        <nav className={styles.socials} aria-label="소셜 링크">
          {profiles.map(({ name, href, icon }) => (
            <a key={name} href={href} aria-label={name}>
              <Image src={icon} alt="" unoptimized />
            </a>
          ))}
        </nav>
      </header>

      <section className={styles.intro} aria-labelledby="intro-heading">
        <h2 id="intro-heading">UNDER + RESTART</h2>
        <div className={styles.story}>
          <p>일을 진행할 때 항상 한 번 씩 막힐 때가 있습니다. 그럴 때 처음부터 차근히 문제를 되짚어가면 생각 정리도 되고 해결 방법이 나옵니다.</p>
          <p>이러한 방식을 토대로 닉네임을 한 번 지어보자는 마음으로 아래(Under)와 다시 시작(Restart) 단어를 합성하여 지었습니다.</p>
        </div>
      </section>

      <section className={styles.content} aria-labelledby="content-heading">
        <h2 id="content-heading" className={styles.sectionTitle}>CONTENT</h2>
        <Link className={styles.techLink} href="/computer" aria-label="Computer · 기술에 대해 궁금하시다면?">
          <Image className={styles.techBanner} src={equipment} alt="Cisco 네트워크 장비와 서버 연결 구성도" unoptimized />
          <span className={styles.caption}>기술에 대해 궁금하시다면?</span>
        </Link>
        <div className={styles.games}>
          {/* Nginx serves a separate static app here, so VRChat needs a full navigation. */}
          <a href="/vrchat" aria-label="VRChat">
            <Image src={vrchat} alt="" unoptimized />
          </a>
          <Link href="/valorant" aria-label="Valorant">
            <Image src={valorant} alt="" unoptimized />
          </Link>
        </div>
        <p className={styles.caption}>저는 이런 게임을 주로 하고 있어요!</p>
      </section>

      <HomePosts />
      <HomeStack />
    </div>
  );
}
