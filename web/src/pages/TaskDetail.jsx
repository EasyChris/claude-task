import { useEffect, useState } from 'react';
import { T, api, imageResolver } from '../api.js';
import Attachments from '../detail/Attachments.jsx';
import RawEditor from '../detail/RawEditor.jsx';
import { useData } from '../hooks.js';
import Markdown, { stripFrontmatter } from '../Markdown.jsx';
import { Link, projectPath } from '../router.jsx';
import { EDITABLE, STATUS, cleanNote } from '../status.js';
import { ErrorBox, Loading, Progress, StatusPill, useToast } from '../ui.jsx';

// 「## 附件」如果是最后一节，就不在正文里重复显示（下面的附件栏会显示缩略图）
function withoutAttachments(body) {
  const m = /\n##\s*附件[^\n]*\n(?![\s\S]*\n##\s)/.exec(`\n${body}`);
  return m ? body.slice(0, Math.max(0, m.index - 1)) : body;
}

export default function TaskDetail({ pid, id, version }) {
  const toast = useToast();
  const { data: task, error, reload, setData } = useData(T(pid, id), version);
  const [busyLine, setBusyLine] = useState(null);
  const [newItem, setNewItem] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (task) document.title = `${task.title} · claude-task`;
    return () => {
      document.title = 'claude-task';
    };
  }, [task?.title]);

  if (error && !task) return <div className="page"><ErrorBox error={error} onRetry={reload} /></div>;
  if (!task) return <Loading />;

  const call = async (method, path, body) => {
    try {
      setData(await api(method, `${T(pid, id)}${path}`, body));
      return true;
    } catch (e) {
      toast(e.message);
      if (e.status === 409) reload();
      return false;
    }
  };

  const toggle = async (s) => {
    setBusyLine(s.line);
    await call('POST', '/toggle', { line: s.line, done: !s.done, text: s.text });
    setBusyLine(null);
  };
  const addItem = async (e) => {
    e.preventDefault();
    const text = newItem.trim();
    if (text && (await call('POST', '/subtasks', { text }))) setNewItem('');
  };

  const resolveImage = imageResolver(pid, task.dir);
  const body = withoutAttachments(stripFrontmatter(task.content));

  if (editing) {
    return (
      <RawEditor
        task={task}
        pid={pid}
        resolveImage={resolveImage}
        onSaved={(t) => {
          setData(t);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="page detail">
      <div className="detail-top">
        <Link to={projectPath(pid, 'board')} className="back">← 看板</Link>
        <span className="mono muted">{task.date} · task-{task.num}</span>
        <button type="button" className="btn small" onClick={() => setEditing(true)}>编辑原文</button>
      </div>

      <header className="detail-head">
        <h1 className="detail-title">{task.title}</h1>
        <div className="detail-status">
          <label className="field inline">
            <span>状态</span>
            <select
              className="input"
              value={EDITABLE.includes(task.status) ? task.status : ''}
              onChange={(e) => call('POST', '/status', { status: e.target.value })}
            >
              {!EDITABLE.includes(task.status) && <option value="">{STATUS[task.status]?.label || '未知'}</option>}
              {EDITABLE.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
            </select>
          </label>
          <StatusPill status={task.status} inferred={task.inferred} />
        </div>
      </header>

      <div className="detail-sub">
        <Progress {...task.progress} wide />
        {task.inferred && <span className="hint">状态来源：推断（旧文件没有 frontmatter；改一次状态就会写进去）</span>}
        {task.note && <span className="hint">索引里写的是：{cleanNote(task.note)}</span>}
      </div>

      <article className="detail-body">
        <Markdown
          text={body}
          offset={task.offset}
          subtasks={task.subtasks}
          onToggle={toggle}
          busyLine={busyLine}
          resolveImage={resolveImage}
        />
        <form className="add-item" onSubmit={addItem}>
          <span className="check-box ghost" aria-hidden="true" />
          <input
            className="input bare"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="+ 添加子任务，回车保存"
            aria-label="添加子任务"
          />
        </form>
      </article>

      <Attachments task={task} pid={pid} resolveImage={resolveImage} onUploaded={setData} />

      {task.sessions?.length > 0 && (
        <section className="related">
          <h2 className="section-title">相关会话</h2>
          <ul>
            {task.sessions.map((s) => (
              <li key={s.name}>
                <Link to={projectPath(pid, 'sessions', `?name=${encodeURIComponent(s.name)}`)} className="mono">{s.name}</Link>
                <span className="muted"> {s.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="file-path mono muted">{task.file}</p>
    </div>
  );
}
