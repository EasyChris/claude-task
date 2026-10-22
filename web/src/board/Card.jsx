import { Link, taskPath } from '../router.jsx';
import { cleanNote } from '../status.js';
import { Progress, StatusPill, shortDate } from '../ui.jsx';

// order：在执行队列里排第几（只有执行队列列传）；slot：拖动时这张卡上方显示落点线
export default function Card({ t, pid, onDragStart, onDragEnd, order, slot }) {
  return (
    <Link
      to={taskPath(pid, t.id)}
      className={`tcard${t.inferred ? ' inferred' : ''}${t.status === 'done' ? ' is-done' : ''}${slot ? ' slot-before' : ''}`}
      draggable
      data-qid={order ? t.id : undefined}
      onDragStart={(e) => onDragStart(e, t)}
      onDragEnd={onDragEnd}
      title={t.inferred ? '旧文件，状态是推断的；拖到其他列就会写进 frontmatter' : undefined}
    >
      <div className="tcard-meta mono">
        <span>
          {order && <span className="tcard-order" aria-label={`执行队列第 ${order} 条`}>{order}</span>}
          {shortDate(t.date)} #{t.num}
        </span>
        {t.status === 'awaiting_approval' && <StatusPill status={t.status} />}
      </div>
      <div className="tcard-title">{t.title}</div>
      <Progress {...t.progress} />
      {t.note && t.status === 'done' && <div className="tcard-note">{cleanNote(t.note)}</div>}
    </Link>
  );
}
