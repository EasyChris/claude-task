// 对话正文：用户 / 回复 / 思考 / 工具调用（和结果配对，默认折叠），排版接近 Claude Code
import { useMemo, useState } from 'react';
import Markdown from '../Markdown.jsx';

const PAGE = 200; // 长会话先显示最后 200 条，往上点「更早的」再展开
const time = (ts) => (ts ? new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '');

function Tool({ it, result }) {
  const state = !result ? 'pending' : result.error ? 'error' : 'ok';
  return (
    <details className={`c-row c-tool ${state}`}>
      <summary>
        <span className="c-tool-name mono">{it.name}</span>
        <span className="c-tool-sum mono">{it.summary}</span>
        {state === 'pending' && <span className="c-tool-state">运行中…</span>}
        {state === 'error' && <span className="c-tool-state err">出错</span>}
      </summary>
      <div className="c-tool-body">
        <div className="c-label">参数</div>
        <pre className="mono">{it.input}</pre>
        {result && (
          <>
            <div className="c-label">结果</div>
            <pre className={`mono${result.error ? ' err' : ''}`}>{result.text || '（空）'}</pre>
          </>
        )}
      </div>
    </details>
  );
}

function Item({ it, results }) {
  switch (it.k) {
    case 'user':
      return (
        <div className="c-row c-user">
          <div className="c-bubble">
            {it.text && <Markdown text={it.text} />}
            {it.images > 0 && <div className="c-img">📎 {it.images} 张图片</div>}
          </div>
          <time className="c-time mono">{time(it.ts)}</time>
        </div>
      );
    case 'command':
      return <div className="c-row c-command mono">{it.text}</div>;
    case 'text':
      return <div className="c-row c-text"><Markdown text={it.text} /></div>;
    case 'thinking':
      return (
        <details className="c-row c-thinking">
          <summary>思考</summary>
          <div className="c-think-body">{it.text}</div>
        </details>
      );
    case 'tool':
      return <Tool it={it} result={results.get(it.id)} />;
    case 'event':
      return <div className="c-row c-event">{it.text}</div>;
    default:
      return null;
  }
}

export default function Conversation({ items }) {
  const [shown, setShown] = useState(PAGE);
  const results = useMemo(() => new Map(items.filter((i) => i.k === 'result').map((i) => [i.id, i])), [items]);
  const visible = useMemo(() => items.filter((i) => i.k !== 'result'), [items]);
  const hidden = Math.max(0, visible.length - shown);

  if (!visible.length) return <p className="hint">这个会话还没有内容。</p>;
  return (
    <div className="convo">
      {hidden > 0 && (
        <button type="button" className="btn small c-more" onClick={() => setShown(shown + PAGE)}>
          显示更早的 {Math.min(hidden, PAGE)} 条（共 {hidden} 条没显示）
        </button>
      )}
      {visible.slice(hidden).map((it, i) => <Item key={hidden + i} it={it} results={results} />)}
    </div>
  );
}
