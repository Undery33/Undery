import Image from "next/image";
import Link from "next/link";
import jenkins from "./assets/jenkins.webp";
import kubernetes from "./assets/kubernetes.webp";
import linux from "./assets/linux.webp";
import windowsServer from "./assets/windows-server.webp";
import styles from "./home-stack.module.css";

const server = [
  { name: "Linux", image: linux },
  { name: "Windows Server", image: windowsServer },
  { name: "Kubernetes", image: kubernetes },
  { name: "Jenkins", image: jenkins },
];

const network = ["Router", "Switch", "ASA"];

export function HomeStack() {
  return (
    <section className={styles.stack} aria-labelledby="stack-heading">
      <h2 id="stack-heading" className={styles.heading}>STACK</h2>
      <h3 className={styles.groupHeading}>SERVER</h3>
      <div className={styles.serverRow}>
        <ul className={styles.cards}>
          {server.map(({ name, image }) => (
            <li key={name}>
              <Image src={image} alt="" className={styles.tile} unoptimized />
              {name}
            </li>
          ))}
        </ul>
        <Link
          href="/computer?category=server#articles"
          aria-label="서버 관련 글 보기"
          title="서버 관련 글 보기"
          className={styles.archiveLink}
        />
      </div>
      <h3 className={styles.groupHeading}>NETWORK</h3>
      <ul className={styles.cards}>
        {network.map((name) => (
          <li key={name}>
            <span aria-hidden="true" className={styles.tile} />
            {name}
          </li>
        ))}
      </ul>
    </section>
  );
}
