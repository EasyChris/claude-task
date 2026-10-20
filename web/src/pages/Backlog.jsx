import { useState } from 'react';
import { B, P, api } from '../api.js';
import BacklogEditor from '../backlog/BacklogEditor.jsx';
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
  const [priority, setPriority] = useState('medium');
  const [openId, setOpenId] = useState(null);
  const [drag, setDrag] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  if (error && !data) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (!data) return <Loading />;
  const items = data.items;

  const add = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await api('POST', `${P(pid)}/backlog`, { title, priority });
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
    const next = move(items, from, to);
    setData({ items: next });
    try {
      setData(await api('POST', `${P(pid)}/backlog/reorder`, { ids: next.map((i) => i.id) }));
    } catch (err) {
      toast(err.message);
      reload();
    }
  };

  const start = async (item) => {
    if (!window.confirm(`开始「${item.title}」？\n会转成今天的 task 文件（状态：规划中），并从规划里移走。`)) return;
    try {
      const out = await api('POST', `${B(pid, item.id)}/start`);
      toast('已转成今天的任务', 'ok');
      navigate(taskPath(pid, out.id));
    } catch (err) {
      toast(err.message);
      reload();
    }
  };

  const open = items.find((i) => i.id === openId);

  return (
    <div className={`page backlog${open ? ' with-panel' : ''}`}>
      <div className="backlog-main">
        <form className="quick-add" onSubmit={add}>
          <input
            className="input grow"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="+ 新任务标题…"
            aria-label="新规划的标题"
          />
          <label className="field inline">
            <span>优先级</span>
            <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <button type="submit" className="btn primary" disabled={!title.trim()}>添加</button>
        </form>

        {!items.length ? (
          <Empty title="规划是空的">
            <p>把以后要做的事加在这里，拖动排序。新开 Claude 会话时，它会看到排在最前面的几条并问你要不要做。</p>
          </Empty>
        ) : (
          <ol className="blist">
            {items.map((it, i) => (
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
                {it.images > 0 && <span className="brow-img mono" title={`${it.images} 张图片`}>📎{it.images}</span>}
                <span className="brow-date mono">{it.created.slice(5, 10)}</span>
                <button type="button" className="btn small" onClick={() => start(it)}>开始</button>
              </li>
            ))}
          </ol>
        )}
        {items.length > 1 && <p className="hint">拖动 ⋮⋮ 排序；点标题在右侧编辑：标题、优先级、描述、贴图。</p>}
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
    </div>
  );
}
