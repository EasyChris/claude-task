import { useState } from 'react';
import { P, T, api } from '../api.js';
import { localDay, useData } from '../hooks.js';
import { Link, projectPath, taskPath } from '../router.jsx';
import { cleanNote } from '../status.js';
import { Empty, ErrorBox, Loading, Progress, StatusPill, shortDate, useToast } from '../ui.jsx';

// 拖进某一列 = 把状态改成这一列的 target
const COLUMNS = [
  { key: 'plan', title: '待开始 / 待确认', target: 'planning', has: ['queued', 'planning', 'awaiting_approval'] },
  { key: 'active', title: '进行中', target: 'in_progress', has: ['in_progress'] },
  { key: 'done', title: '已完成', hint: '近 7 天', target: 'done', has: ['done'] },
];

function weekAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return localDay(d);
}

function Card({ t, pid, onDragStart }) {
  return (
    <Link
      to={taskPath(pid, t.id)}
      className={`tcard${t.inferred ? ' inferred' : ''}${t.status === 'done' ? ' is-done' : ''}`}
      draggable
      onDragStart={(e) => onDragStart(e, t)}
      title={t.inferred ? '旧文件，状态是推断的；拖到其他列就会写进 frontmatter' : undefined}
    >
      <div className="tcard-meta mono">
        <span>{shortDate(t.date)} #{t.num}</span>
        {t.status === 'awaiting_approval' && <StatusPill status={t.status} />}
      </div>
      <div className="tcard-title">{t.title}</div>
      <Progress {...t.progress} />
      {t.note && t.status === 'done' && <div className="tcard-note">{cleanNote(t.note)}</div>}
    </Link>
  );
}

export default function Board({ pid, version }) {
  // 规划队列（docs/backlog）不在看板上，列头给个数和入口
  const backlog = useData(`${P(pid)}/backlog`, version).data?.items || [];
  const drafts = backlog.filter((i) => i.status === 'draft').length;
  const queued = backlog.length - drafts;
  const toast = useToast();
  const { data, error, reload, setData } = useData(`${P(pid)}/tasks`, version);
  const [over, setOver] = useState(null);
  const [showStale, setShowStale] = useState(false);
  const [showRest, setShowRest] = useState(false);

  if (error && !data) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (!data) return <Loading />;

  const tasks = data.tasks;
  const since = weekAgo();
  const inCol = (c) => tasks.filter((t) => c.has.includes(t.status) && !t.stale)
    .filter((t) => c.key !== 'done' || (t.completed || t.date).slice(0, 10) >= since);
  const stale = tasks.filter((t) => t.stale);
  const rest = tasks.filter((t) => ['paused', 'cancelled', 'unknown'].includes(t.status));

  const onDragStart = (e, t) => {
    e.dataTransfer.setData('text/x-task', t.id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const drop = async (e, target) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData('text/x-task');
    const t = tasks.find((x) => x.id === id);
    if (!t || (t.status === target && !t.inferred)) return;
    // 先在页面上挪过去，失败再拉回来
    setData({ tasks: tasks.map((x) => (x.id === id ? { ...x, status: target, inferred: false, stale: false, completed: target === 'done' ? localDay() : x.completed } : x)) });
    try {
      await api('POST', `${T(pid, id)}/status`, { status: target });
    } catch (err) {
      toast(err.message);
      reload();
    }
  };
  const zone = (key, target) => ({
    onDragOver: (e) => {
      e.preventDefault();
      if (over !== key) setOver(key);
    },
    onDragLeave: (e) => !e.currentTarget.contains(e.relatedTarget) && setOver(null),
    onDrop: (e) => drop(e, target),
  });

  if (!tasks.length) {
    return (
      <div className="page">
        <Empty title="还没有任务">
          <p>在「规划」里加一条，点「开始」就会变成今天的任务；或者让 Claude 按 CLAUDE.md 的流程建 task 文件。</p>
        </Empty>
      </div>
    );
  }

  return (
    <div className="page board-page">
      <div className="board">
        {COLUMNS.map((c) => {
          const items = inCol(c);
          return (
            <section key={c.key} className={`col col-${c.key}${over === c.key ? ' over' : ''}`} aria-label={c.title} {...zone(c.key, c.target)}>
              <h2 className="col-head">
                <span>{c.title}</span>
                <span className="col-count mono">{items.length}</span>
                {c.hint && <span className="col-hint">{c.hint}</span>}
                {c.key === 'plan' && queued + drafts > 0 && (
                  <Link to={projectPath(pid, 'backlog')} className="col-link" title="规划里的条目点「开始」后才会出现在看板上">
                    规划队列 {queued} 条{drafts ? ` · 草稿 ${drafts}` : ''} →
                  </Link>
                )}
              </h2>
              <div className="col-body">
                {items.map((t) => <Card key={t.id} t={t} pid={pid} onDragStart={onDragStart} />)}
                {!items.length && <div className="col-empty">拖到这里</div>}
                {c.key === 'active' && stale.length > 0 && (
                  <div className="stale">
                    <button type="button" className="fold" aria-expanded={showStale} onClick={() => setShowStale(!showStale)}>
                      {showStale ? '▾' : '▸'} 两周没动的旧任务 {stale.length}
                      <span className="fold-hint">有没勾的子任务，多半已做完；拖到「已完成」就定下来</span>
                    </button>
                    {showStale && stale.map((t) => <Card key={t.id} t={t} pid={pid} onDragStart={onDragStart} />)}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <section className={`rest${over === 'rest' ? ' over' : ''}`} {...zone('rest', 'paused')} aria-label="暂存和取消">
        <button type="button" className="fold" aria-expanded={showRest} onClick={() => setShowRest(!showRest)}>
          {showRest ? '▾' : '▸'} 暂存 / 取消 / 状态未知 {rest.length}
          <span className="fold-hint">拖到这里 = 暂存</span>
        </button>
        {showRest && (
          <div className="rest-body">
            {rest.map((t) => <Card key={t.id} t={t} pid={pid} onDragStart={onDragStart} />)}
          </div>
        )}
      </section>
    </div>
  );
}
