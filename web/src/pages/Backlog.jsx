// 规划页：只放草稿。快速添加 / 新建 / 批量新建都建草稿；勾选几条可以一起让 AI 整理，确认在草稿页里逐条做
import { useState } from 'react';
import { P, api } from '../api.js';
import BatchNewModal from '../draft/BatchNewModal.jsx';
import DraftList, { canBatch } from '../draft/DraftList.jsx';
import NewTaskModal from '../draft/NewTaskModal.jsx';
import { useAiEvents, useData } from '../hooks.js';
import { Empty, ErrorBox, Loading, useToast } from '../ui.jsx';

export default function Backlog({ pid, version }) {
  const toast = useToast();
  const { data, error, reload } = useData(`${P(pid)}/backlog`, version);
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [batch, setBatch] = useState(false);
  const [picked, setPicked] = useState(() => new Set());
  const [useProject, setUseProject] = useState(true);
  const [busy, setBusy] = useState(false);

  // 排队 → 开跑、整理结束都不改项目里的文件，靠 ai 事件刷新列表
  useAiEvents((d) => {
    if (d.project === pid && ['queued', 'start', 'done', 'error'].includes(d.kind)) reload();
  });

  if (error && !data) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (!data) return <Loading />;
  const drafts = data.items.filter((i) => i.status === 'draft');
  const chosen = drafts.filter((d) => picked.has(d.id) && canBatch(d));
  const choosable = drafts.filter(canBatch);

  // 快速添加：建一条草稿（不经过 AI），之后可以让 AI 整理，也可以手改后直接确认
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

  const pick = (id) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };
  const pickAll = () => setPicked(chosen.length === choosable.length ? new Set() : new Set(choosable.map((d) => d.id)));

  const runBatch = async () => {
    setBusy(true);
    try {
      const { results } = await api('POST', `${P(pid)}/backlog/ai`, { ids: chosen.map((d) => d.id), useProject });
      const bad = results.filter((r) => r.error);
      const queued = results.filter((r) => r.queued).length;
      toast(bad.length ? `${bad.length} 条没开始：${bad[0].error}` : `已开始整理${queued ? `，${queued} 条在排队` : ''}`, bad.length ? 'error' : 'ok');
      setPicked(new Set());
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
      reload();
    }
  };

  return (
    <div className="page backlog">
      <div className="backlog-main">
        <div className="backlog-actions">
          <button type="button" className="btn primary" onClick={() => setCreating(true)}>+ 新建任务</button>
          <button type="button" className="btn" onClick={() => setBatch(true)}>批量新建</button>
          <span className="hint">确认后的草稿会直接出现在看板「待开始」列</span>
        </div>

        <form className="quick-add" onSubmit={quickAdd}>
          <input
            className="input grow"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="+ 快速加一条草稿（不经过 AI）"
            aria-label="快速添加草稿"
          />
          <button type="submit" className="btn" disabled={!title.trim()}>添加</button>
        </form>

        <h2 className="section-title">
          草稿 <span className="muted mono">{drafts.length}</span>
        </h2>
        {!drafts.length ? (
          <Empty title="还没有草稿">
            <p>新建任务贴需求、贴图，或者用上面的输入框快速加一条；让 AI 整理或手改后，在草稿页确认就上看板。</p>
          </Empty>
        ) : (
          <>
            <div className="batch-bar">
              <label className="check-line">
                <input type="checkbox" checked={!!choosable.length && chosen.length === choosable.length} disabled={!choosable.length} onChange={pickAll} />
                全选未整理的
              </label>
              <label className="check-line">
                <input type="checkbox" checked={useProject} onChange={(e) => setUseProject(e.target.checked)} />
                参考项目代码和历史任务
              </label>
              <button type="button" className="btn small primary" disabled={busy || !chosen.length} onClick={runBatch}>
                ✨ AI 整理选中的{chosen.length ? ` ${chosen.length} 条` : ''}
              </button>
            </div>
            <DraftList pid={pid} drafts={drafts} picked={picked} onPick={pick} />
            <p className="hint">同时最多整理 3 条，其余排队自动接上。回答问题、继续对话、确认都在草稿页里逐条做。</p>
          </>
        )}
      </div>

      {creating && <NewTaskModal pid={pid} onClose={() => setCreating(false)} onCreated={reload} />}
      {batch && <BatchNewModal pid={pid} onClose={() => setBatch(false)} onCreated={reload} />}
    </div>
  );
}
