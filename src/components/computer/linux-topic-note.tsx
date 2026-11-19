import Link from "next/link";
import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { Markdown } from "@/components/markdown";
import type { Article } from "@/lib/articles";
import { linuxTopicTitles, type LinuxTopic } from "@/lib/linux-topics";
import { ComputerNotesPanel } from "./computer-notes-panel";

const parser = unified().use(remarkParse).use(remarkGfm);

/** Split only top-level H2s. Headings inside code, lists or blockquotes remain in the body. */
function articleSections(article: Article) {
  const sections: { title: string; blocks: string[] }[] = [];
  const introduction: string[] = [];
  const definitions: string[] = [];
  let blocks = introduction;
  for (const node of parser.parse(article.body).children) {
    if (node.type === "heading" && node.depth === 2) {
      blocks = sections.length ? [] : [...introduction];
      sections.push({ title: toString(node) || article.title, blocks });
    } else {
      const source = article.body.slice(node.position!.start.offset, node.position!.end.offset);
      // A Markdown reference definition can be authored under another heading.
      if (node.type === "definition" || node.type === "footnoteDefinition") definitions.push(source);
      else blocks.push(source);
    }
  }
  if (!sections.length) sections.push({ title: article.title, blocks: introduction });
  return sections.map(({ title, blocks }, index) => ({
    title,
    body: <>
      {index === 0 && <p>{article.description}</p>}
      <Markdown>{[...blocks, ...definitions].join("\n\n")}</Markdown>
      <Link href={"/computer/" + article.slug}>글 전체 보기</Link>
    </>,
  }));
}

export function LinuxTopicNote({ topic, article }: { topic: LinuxTopic; article?: Article }) {
  const published = article && !article.draft && article.slug === topic ? article : undefined;
  return (
    <ComputerNotesPanel id={"linux-topic-title-" + topic} title={published?.title ?? linuxTopicTitles[topic]}
      caption="Linux" data-linux-topic-note={topic} items={published ? articleSections(published) : []}>
      {!published && <p>등록된 글이 없습니다.</p>}
    </ComputerNotesPanel>
  );
}
