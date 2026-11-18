import { getPosts } from "@/lib/posts";
import { toPostSummary } from "@/lib/post-summary";
import { HomePostList } from "./home-post-list";
import styles from "./home-posts.module.css";

export async function HomePosts() {
  const posts = await getPosts();

  return (
    <section className={styles.section} id="posts" aria-labelledby="home-post-title">
      <h2 className={styles.heading} id="home-post-title">POST</h2>
      <HomePostList posts={posts.map(toPostSummary)} />
    </section>
  );
}
