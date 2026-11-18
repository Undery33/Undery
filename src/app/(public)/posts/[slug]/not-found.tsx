import Link from "next/link";
import styles from "../posts.module.css";

export default function PostNotFound() {
  return (
    <section className={styles.page}>
      <h1>게시글을 찾을 수 없습니다.</h1>
      <Link className={styles.back} href="/posts">← POST 목록</Link>
    </section>
  );
}
