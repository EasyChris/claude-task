import { useState } from 'react';
import { B, P, api } from '../api.js';
import BacklogEditor from '../backlog/BacklogEditor.jsx';
import DraftList from '../draft/DraftList.jsx';
import NewTaskModal from '../draft/NewTaskModal.jsx';
import { useData } from '../hooks.js';
import { navigate, taskPath } from '../router.jsx';
import { PRIORITY } from '../status.js';
import { Empty, ErrorBox, Loading, useToast } from '../ui.jsx';

function move(list, from, to) {
  const next = [...list];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

export default function Backlog({ pid, version }) {
  const toast = useToast();
  const { data, error, reload, setData } = useData(`${P(pid)}/backlog`, version);
  const [title, setTitle] = useState('');
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [drag, setDrag] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  if (error && !data) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (!data) return <Loading />;
  const drafts = data.items.filter((i) => i.status === 'draft');
  const queue = data.items.filter((i) => i.status !== 'draft');

  // 快速添加：不经过 AI，直接进待执行队列
  const quickAdd = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await api('POST', `${P(pid)}/backlog`, { title });
      setTitle('');
      reload();
    } catch (err) {
      toast(err.message);
    }
  };

  const drop = async (to) => {
    const from = drag;
    setDrag(null);
    setOverIdx(null);
    if (from === null || from === to) return;
    const next = move(queue, from, to);
    setData({ items: [...drafts, ...next] });
    try {
      await api('POST', `${P(pid)}/backlog/reorder`, { ids: next.map((i) => i.id) });
      reload();
    } catch (err) {
      toast(err.message);
      reload();
    }
  };

  const start = async (item) => {
    const how = item.approved ? '计划已确认，转成今天的 task 文件后可以直接开工' : '会转成今天的 task 文件（状态：规划中）';
    if (!window.confirm(`开始「${item.title}」？\n${how}，并从规划里移走。`)) return;
    try {
      const out = await api('POST', `${B(pid, item.id)}/start`);
      toast('已转成今天的任务', 'ok');
      navigate(taskPath(pid, out.id));
    } catch (err) {
      toast(err.message);
      reload();
    }
  };

  const open = queue.find((i) => i.id === openId);

  return (
    <div className={`page backlog${open ? ' with-panel' : ''}`}>
      <div className="backlog-main">
        <div className="backlog-actions">
          <button type="button" className="btn primary" onClick={() => setCreating(true)}>+ 新建任务</button>
          <span className="hint">贴需求、贴图，让 AI 帮你整理成计划</span>
        </div>

        <DraftList pid={pid} drafts={drafts} />

        <h2 className="section-title queue-title">
          待执行队列 <span className="muted mono">{queue.length}</span>
          <span className="hint">按顺序做；新开 Claude 会话时会问你要不要做第 1 条</span>
        </h2>
        <form className="quick-add" onSubmit={quickAdd}>
          <input
            className="input grow"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="+ 快速加一条（不经过 AI，直接进队列）"
            aria-label="快速添加规划"
          />
          <button type="submit" className="btn" disabled={!title.trim()}>添加</button>
        </form>

        {!queue.length ? (
          <Empty title="队列是空的">
            <p>新建任务让 AI 整理，确认后就排到这里；也可以用上面的输入框直接加。</p>
          </Empty>
        ) : (
          <ol className="blist">
            {queue.map((it, i) => (
              <li
                key={it.id}
                className={`brow${openId === it.id ? ' active' : ''}${overIdx === i && drag !== null && drag !== i ? ' drop-at' : ''}${drag === i ? ' dragging' : ''}`}
                onDragOver={(e) => {
                  if (drag === null) return;
                  e.preventDefault();
                  setOverIdx(i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(i);
                }}
              >
                <span
                  className="grip"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', it.id);
                    setDrag(i);
                  }}
                  onDragEnd={() => {
                    setDrag(null);
                    setOverIdx(null);
                  }}
                  title="拖动排序"
                  aria-hidden="true"
                >⋮⋮</span>
                <span className="brow-n mono">{i + 1}</span>
                <span className={`prio tone-${PRIORITY[it.priority].tone}`} title={`优先级：${PRIORITY[it.priority].label}`}>
                  {PRIORITY[it.priority].label}
                </span>
                <button type="button" className="brow-title" onClick={() => setOpenId(openId === it.id ? null : it.id)}>
                  {it.title}
                </button>
                {it.approved && <span className="ok-mark" title="计划已在 Web 上确认，开工不再等确认">✓ 已确认</span>}
                {it.images > 0 && <span className="brow-img mono" title={`${it.images} 张图片`}>📎{it.images}</span>}
                <span className="brow-date mono">{it.created.slice(5, 10)}</span>
                <button type="button" className="btn small" onClick={() => start(it)}>开始</button>
              </li>
            ))}
          </ol>
        )}
        {queue.length > 1 && <p className="hint">拖动 ⋮⋮ 排序；点标题在右侧编辑。</p>}
      </div>

      {open && (
        <BacklogEditor
          key={open.id}
          pid={pid}
          item={open}
          onSaved={reload}
          onClose={() => setOpenId(null)}
          onDeleted={(next) => {
            setOpenId(null);
            setData(next);
          }}
          onStart={() => start(open)}
        />
      )}
      {creating && <NewTaskModal pid={pid} onClose={() => setCreating(false)} onCreated={reload} />}
    </div>
  );
}
