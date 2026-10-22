import { useRef, useState } from 'react';
import { P, T, api } from '../api.js';
import Card from '../board/Card.jsx';
import { localDay, useData } from '../hooks.js';
import { Link, projectPath } from '../router.jsx';
import { QUEUE_STATUSES } from '../status.js';
import { Empty, ErrorBox, Loading, useToast } from '../ui.jsx';

// 拖进「执行队列」= 排进 run_order（可以落在指定位置）；拖回「待开始」= 移出队列
// 拖进其他列 = 把状态改成这一列的 target（服务端顺带去掉 run_order，只改状态，不会触发执行）
const COLUMNS = [
  { key: 'todo', title: '待开始', target: 'planning' },
  { key: 'queue', title: '执行队列' },
  { key: 'active', title: '进行中', target: 'in_progress' },
  { key: 'done', title: '已完成', hint: '近 7 天', target: 'done' },
];

function weekAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return localDay(d);
}

const waiting = (t) => QUEUE_STATUSES.includes(t.status) && !t.stale;
const byOrder = (a, b) => a.runOrder - b.runOrder || a.id.localeCompare(b.id);

export default function Board({ pid, version }) {
  // 规划草稿（docs/backlog）不在看板上，列头给个数和入口；确认后才变成看板上的任务
  const backlog = useData(`${P(pid)}/backlog`, version).data?.items || [];
  const drafts = backlog.filter((i) => i.status === 'draft').length;
  const toast = useToast();
  const { data, error, reload, setData } = useData(`${P(pid)}/tasks`, version);
  const [over, setOver] = useState(null);
  const [before, setBefore] = useState(''); // 拖到执行队列时落在哪张卡前面；'' = 最后
  const dragId = useRef(null);
  const [showStale, setShowStale] = useState(false);
  const [showRest, setShowRest] = useState(false);

  if (error && !data) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (!data) return <Loading />;

  const tasks = data.tasks;
  const since = weekAgo();
  const cols = {
    todo: tasks.filter((t) => waiting(t) && !t.runOrder),
    queue: tasks.filter((t) => waiting(t) && t.runOrder).sort(byOrder),
    active: tasks.filter((t) => t.status === 'in_progress' && !t.stale),
    done: tasks.filter((t) => t.status === 'done' && (t.completed || t.date).slice(0, 10) >= since),
  };
  const queueIds = cols.queue.map((t) => t.id);
  const stale = tasks.filter((t) => t.stale);
  const rest = tasks.filter((t) => ['paused', 'cancelled', 'unknown'].includes(t.status));

  const onDragStart = (e, t) => {
    dragId.current = t.id;
    e.dataTransfer.setData('text/x-task', t.id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragEnd = () => {
    dragId.current = null;
    setOver(null);
  };

  // 先在页面上挪过去，失败再拉回来
  const save = async (patch, req) => {
    setData({ tasks: tasks.map((x) => ({ ...x, ...patch(x) })) });
    try {
      await req();
    } catch (err) {
      toast(err.message);
      reload();
    }
  };
  // 整列顺序一次写好：ids 里的排成 1..n，其余去掉 run_order；不在待开始状态的先改成 queued
  const writeQueue = (ids) => {
    const ord = new Map(ids.map((id, i) => [id, i + 1]));
    return save((x) => (ord.has(x.id)
      ? { runOrder: ord.get(x.id), status: waiting(x) && !x.inferred ? x.status : 'queued', inferred: false, stale: false }
      : { runOrder: null }), () => api('POST', `${P(pid)}/queue`, { ids }));
  };
  const writeStatus = (t, status) => save((x) => (x.id === t.id
    ? { status, runOrder: null, inferred: false, stale: false, completed: status === 'done' ? localDay() : x.completed }
    : {}), () => api('POST', `${T(pid, t.id)}/status`, { status }));

  const drop = (e, c) => {
    e.preventDefault();
    setOver(null);
    const id = dragId.current || e.dataTransfer.getData('text/x-task');
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    if (c.key === 'queue') {
      const ids = queueIds.filter((x) => x !== id);
      ids.splice(before ? ids.indexOf(before) : ids.length, 0, id);
      if (ids.join() !== queueIds.join()) writeQueue(ids);
      return;
    }
    if (c.key === 'todo' && queueIds.includes(id)) return writeQueue(queueIds.filter((x) => x !== id));
    if (c.key === 'todo' && waiting(t) && !t.inferred) return;
    if (t.status === c.target && !t.inferred) return;
    writeStatus(t, c.target);
  };
  // 执行队列里按鼠标位置算落点：第一张中线在鼠标下方的卡（不算正在拖的那张）
  const pickSlot = (e) => {
    const cards = [...e.currentTarget.querySelectorAll('[data-qid]')].filter((el) => el.dataset.qid !== dragId.current);
    const hit = cards.find((el) => {
      const r = el.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    const b = hit?.dataset.qid || '';
    if (b !== before) setBefore(b);
  };
  const zone = (key, onDrop) => ({
    onDragOver: (e) => {
      e.preventDefault();
      if (over !== key) setOver(key);
      if (key === 'queue') pickSlot(e);
    },
    onDragLeave: (e) => !e.currentTarget.contains(e.relatedTarget) && setOver(null),
    onDrop,
  });
  const cardProps = { pid, onDragStart, onDragEnd };

  if (!tasks.length) {
    return (
      <div className="page">
        <Empty title="还没有任务">
          <p>在「规划」里加草稿，确认后就会变成今天的任务；或者让 Claude 按 CLAUDE.md 的流程建 task 文件。</p>
        </Empty>
      </div>
    );
  }

  return (
    <div className="page board-page">
      <div className="board">
        {COLUMNS.map((c) => {
          const items = cols[c.key];
          const isQueue = c.key === 'queue';
          const dragging = over === c.key;
          return (
            <section key={c.key} className={`col col-${c.key}${dragging ? ' over' : ''}`} aria-label={c.title} {...zone(c.key, (e) => drop(e, c))}>
              <h2 className="col-head">
                <span>{c.title}</span>
                <span className="col-count mono">{items.length}</span>
                {c.hint && <span className="col-hint">{c.hint}</span>}
                {isQueue && items.length > 0 && <span className="col-hint mono" title="在 Claude Code 里输入 /next，一次做一条">/next</span>}
                {c.key === 'todo' && drafts > 0 && (
                  <Link to={projectPath(pid, 'backlog')} className="col-link" title="规划里的草稿确认后才会出现在看板上">
                    规划草稿 {drafts} 条 →
                  </Link>
                )}
              </h2>
              <div className={`col-body${isQueue && dragging && !before ? ' slot-end' : ''}`}>
                {items.map((t, i) => (
                  <Card key={t.id} t={t} {...cardProps} order={isQueue ? i + 1 : undefined} slot={isQueue && dragging && before === t.id} />
                ))}
                {!items.length && (
                  <div className="col-empty">{isQueue ? '把待开始的任务拖进来，CLI 里输入 /next 按顺序做' : '拖到这里'}</div>
                )}
                {c.key === 'active' && stale.length > 0 && (
                  <div className="stale">
                    <button type="button" className="fold" aria-expanded={showStale} onClick={() => setShowStale(!showStale)}>
                      {showStale ? '▾' : '▸'} 两周没动的旧任务 {stale.length}
                      <span className="fold-hint">有没勾的子任务，多半已做完；拖到「已完成」就定下来</span>
                    </button>
                    {showStale && stale.map((t) => <Card key={t.id} t={t} {...cardProps} />)}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <section className={`rest${over === 'rest' ? ' over' : ''}`} {...zone('rest', (e) => drop(e, { key: 'rest', target: 'paused' }))} aria-label="暂存和取消">
        <button type="button" className="fold" aria-expanded={showRest} onClick={() => setShowRest(!showRest)}>
          {showRest ? '▾' : '▸'} 暂存 / 取消 / 状态未知 {rest.length}
          <span className="fold-hint">拖到这里 = 暂存</span>
        </button>
        {showRest && (
          <div className="rest-body">
            {rest.map((t) => <Card key={t.id} t={t} {...cardProps} />)}
          </div>
        )}
      </section>
    </div>
  );
}
