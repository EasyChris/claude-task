// 规划页的草稿列表：每条显示 AI 整理到哪一步了；可以勾选几条一起让 AI 整理
import { Link, draftPath } from '../router.jsx';

function DraftState({ d }) {
  if (d.running) return <span className="pill tone-active">整理中…</span>;
  if (d.queued) return <span className="pill tone-muted">排队中</span>;
  if (d.lastError) return <span className="pill tone-active" title={d.lastError}>出错</span>;
  if (d.questions) return <span className="pill tone-wait">有 {d.questions} 个问题</span>;
  if (d.rounds) return <span className="pill tone-plan">可以确认</span>;
  return <span className="pill tone-muted">未整理</span>;
}

// 整理过的要在草稿页回答问题或继续对话；正在跑、排队中的也不能再勾
export const canBatch = (d) => !d.rounds && !d.running && !d.queued;

export default function DraftList({ pid, drafts, picked, onPick }) {
  if (!drafts.length) return null;
  return (
    <ul className="dlist">
      {drafts.map((d) => (
        <li key={d.id} className="drow-wrap">
          <input
            type="checkbox"
            className="drow-check"
            checked={picked.has(d.id)}
            disabled={!canBatch(d)}
            onChange={() => onPick(d.id)}
            aria-label={`选中「${d.title}」`}
            title={canBatch(d) ? undefined : '整理过、整理中或排队中的不能再批量整理'}
          />
          <Link to={draftPath(pid, d.id)} className="drow">
            <span className="drow-title">{d.title}</span>
            <DraftState d={d} />
            <span className="brow-date mono">{d.created.slice(5, 10)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
