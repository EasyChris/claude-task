import { P } from '../api.js';
import { useData } from '../hooks.js';
import Markdown from '../Markdown.jsx';
import { Link, projectPath } from '../router.jsx';
import { Empty, ErrorBox, Loading } from '../ui.jsx';

const when = (ms) => new Date(ms).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

// 会话记录只读：这些是 Claude 写的，网页上改容易和 Claude 同时写冲突
export default function Sessions({ pid, version, search }) {
  const list = useData(`${P(pid)}/sessions`, version);
  const sessions = list.data?.sessions || [];
  const name = new URLSearchParams(search).get('name') || sessions[0]?.name || '';
  const one = useData(name ? `${P(pid)}/session?name=${encodeURIComponent(name)}` : null, version);

  if (list.error && !list.data) return <div className="page"><ErrorBox error={list.error} onRetry={list.reload} /></div>;
  if (!list.data) return <Loading />;
  if (!sessions.length) {
    return (
      <div className="page">
        <Empty title="还没有会话记录">
          <p>Claude 会按 CLAUDE.md 的规则把会话记录写到记忆目录的 <span className="mono">sessions/</span> 下，写了就会出现在这里。</p>
        </Empty>
      </div>
    );
  }

  return (
    <div className="page sessions">
      <nav className="slist" aria-label="会话记录">
        {sessions.map((s) => (
          <Link
            key={s.name}
            to={projectPath(pid, 'sessions', `?name=${encodeURIComponent(s.name)}`)}
            className={`srow${s.name === name ? ' active' : ''}`}
            aria-current={s.name === name ? 'page' : undefined}
          >
            <span className="srow-key mono">{s.key}</span>
            <span className="srow-title">{s.title.replace(/^\d{4}-\d{2}-\d{2}(-\d+)?\s*[-—]\s*/, '')}</span>
          </Link>
        ))}
      </nav>
      <article className="sbody">
        {one.error && <ErrorBox error={one.error} />}
        {!one.data && !one.error && <Loading />}
        {one.data && (
          <>
            <div className="sbody-meta mono muted">{one.data.name} · 更新于 {when(one.data.updated)} · 只读</div>
            <Markdown text={one.data.content} />
          </>
        )}
      </article>
    </div>
  );
}
