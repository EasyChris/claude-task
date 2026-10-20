// 规划页上方的草稿列表：每条显示 AI 整理到哪一步了
import { Link, draftPath } from '../router.jsx';

function DraftState({ d }) {
  if (d.running) return <span className="pill tone-active">整理中…</span>;
  if (d.lastError) return <span className="pill tone-muted">上次出错</span>;
  if (d.questions) return <span className="pill tone-wait">{d.questions} 个问题待回答</span>;
  if (d.rounds) return <span className="pill tone-plan">已整理，待确认</span>;
  return <span className="pill tone-muted">未整理</span>;
}

export default function DraftList({ pid, drafts }) {
  if (!drafts.length) return null;
  return (
    <section className="drafts" aria-labelledby="drafts-title">
      <h2 id="drafts-title" className="section-title">
        草稿 <span className="muted mono">{drafts.length}</span>
        <span className="hint">确认后才会进下面的待执行队列</span>
      </h2>
      <ul className="dlist">
        {drafts.map((d) => (
          <li key={d.id}>
            <Link to={draftPath(pid, d.id)} className="drow">
              <span className="drow-icon" aria-hidden="true">✎</span>
              <span className="drow-title">{d.title}</span>
              <DraftState d={d} />
              <span className="brow-date mono">{d.created.slice(5, 10)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
