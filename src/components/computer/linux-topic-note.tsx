import Link from "next/link";
import { Markdown } from "@/components/markdown";
import type { Article } from "@/lib/articles";
import { linuxTopicTitles, type LinuxTopic } from "@/lib/linux-topics";
import styles from "./linux-topic-note.module.css";

export function LinuxTopicNote({ topic, article }: { topic: LinuxTopic; article?: Article }) {
  const published = article && !article.draft && article.slug === topic ? article : undefined;
  const heading = `linux-topic-title-${topic}`;
  return (
    <section data-linux-topic-note={topic} className={styles.note} aria-labelledby={heading}>
      <header className={styles.heading}>
        <h2 id={heading}>{published?.title ?? linuxTopicTitles[topic]}</h2>
        {published && <p>{published.description}</p>}
      </header>
      {published ? (
        <div className={styles.body}>
          <Markdown>{published.body}</Markdown>
          <Link className={styles.fullArticle} href={`/computer/${topic}`}>글 전체 보기</Link>
        </div>
      ) : <p className={styles.empty}>등록된 글이 없습니다.</p>}
    </section>
  );
}
