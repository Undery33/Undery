import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Raw HTML is disabled. No MDX or user-supplied executable components. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {children}
      </ReactMarkdown>
    </div>
  );
}
