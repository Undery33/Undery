import { HomeServerCarousel } from "./home-server-carousel";
import styles from "./home-stack.module.css";

const network = ["Router", "Switch", "ASA"];

export function HomeStack() {
  return (
    <section className={styles.stack} aria-labelledby="stack-heading">
      <h2 id="stack-heading" className={styles.heading}>STACK</h2>
      <h3 className={styles.groupHeading}>SERVER</h3>
      <HomeServerCarousel />
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
