import { getArticles } from "@/lib/articles";
import { getComputerCategory } from "@/lib/computer-categories";
import { HomePostList } from "./home-post-list";
import styles from "./home-posts.module.css";

export async function HomePosts() {
  const articles = await getArticles();
  const posts = articles.map(({ slug, title, description, publishedAt, category, tags }) => {
    const field = getComputerCategory(category);
    return {
      slug, title, publishedAt,
      category: category === "ai" ? "AI" : field?.english ?? "Computer",
      keywords: [title, description, ...tags].join(" ").normalize("NFKC").toLocaleLowerCase("ko-KR"),
    };
  });

  return (
    <section className={styles.section} id="posts" aria-labelledby="home-post-title">
      <h2 className={styles.heading} id="home-post-title">POST</h2>
      <HomePostList posts={posts} />
    </section>
  );
}
