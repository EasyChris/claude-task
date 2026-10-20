// markdown 渲染；传了 onToggle 时，正文里的 `- [ ]` 变成可点的勾选框（按文件行号对应到 subtasks）
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const strip = ({ node, ...props }) => props;

export default function Markdown({ text, offset = 0, subtasks, onToggle, resolveImage, busyLine }) {
  const byLine = new Map((subtasks || []).map((s) => [s.line, s]));
  const interactive = Boolean(onToggle);

  const components = {
    img: (p) => {
      const { src, alt } = strip(p);
      const url = resolveImage ? resolveImage(src) : src;
      return (
        <a href={url} target="_blank" rel="noreferrer noopener" className="md-img">
          <img src={url} alt={alt || ''} loading="lazy" />
        </a>
      );
    },
    a: (p) => {
      const { href, children } = strip(p);
      return <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>;
    },
    input: (p) => (interactive && p.type === 'checkbox' ? null : <input {...strip(p)} />),
    li: ({ node, className, children, ...rest }) => {
      if (!interactive || !String(className || '').includes('task-list-item')) {
        return <li className={className} {...rest}>{children}</li>;
      }
      const line = offset + node.position.start.line - 1;
      const s = byLine.get(line);
      if (!s) return <li className={className}>{children}</li>;
      return (
        <li className={`${className} interactive${s.done ? ' checked' : ''}`}>
          <label className="check">
            <input
              type="checkbox"
              checked={s.done}
              disabled={busyLine === line}
              onChange={() => onToggle(s)}
              aria-label={`${s.done ? '取消勾选' : '勾选'}：${s.text}`}
            />
            <span className="check-box" aria-hidden="true" />
          </label>
          <div className="check-text">{children}</div>
        </li>
      );
    },
  };

  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

// 去掉开头的 frontmatter（预览用）
export const stripFrontmatter = (text) => text.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '');
