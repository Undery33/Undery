import type { ReactNode } from "react";
import styles from "./computer-notes-panel.module.css";

type NotesPanelProps = {
  id: string;
  title: string;
  caption: string;
  items: { title: string; body: ReactNode }[];
  children?: ReactNode;
  "data-device-notes"?: string;
  "data-linux-topic-note"?: string;
};

export function ComputerNotesPanel({ id, title, caption, items, children, ...panelData }: NotesPanelProps) {
  return (
    <section className={styles.panel} aria-labelledby={id} {...panelData}>
      <h2 className={styles.title} id={id}>{title}</h2>
      <div className={styles.content}>
        {items.length > 0 ? (
          <ol className={styles.topics}>
            {items.map((item, index) => (
              <li key={`${index}-${item.title}`}>
                <details>
                  <summary className={styles.row}>
                    <span aria-hidden="true">{String(index + 1).padStart(2, "0")}.</span>{" "}{item.title}
                  </summary>
                  <div className={styles.body}>{item.body}</div>
                </details>
              </li>
            ))}
          </ol>
        ) : children}
      </div>
      <footer className={styles.caption}>{caption}</footer>
    </section>
  );
}
