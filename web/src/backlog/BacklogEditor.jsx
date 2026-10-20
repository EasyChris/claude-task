// 规划右侧编辑面板：标题、优先级、描述（可贴图），⌘S 保存
import { useEffect, useRef, useState } from 'react';
import { B, api, imageResolver } from '../api.js';
import { useSaveKey } from '../hooks.js';
import Markdown from '../Markdown.jsx';
import { imageFromEvent, insertAtCursor } from '../paste.js';
import { PRIORITY } from '../status.js';
import { useToast } from '../ui.jsx';

export default function BacklogEditor({ pid, item, onSaved, onClose, onDeleted, onStart }) {
  const toast = useToast();
  const [title, setTitle] = useState(item.title);
  const [priority, setPriority] = useState(item.priority);
  const [body, setBody] = useState(item.body);
  const [base, setBase] = useState(item.hash);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);
  const dirty = title !== item.title || priority !== item.priority || body !== item.body;
  const resolveImage = imageResolver(pid, 'docs/backlog');

  // 别处（Claude 或另一个标签页）改了这条，而这里没有未保存的修改：直接换成新内容
  useEffect(() => {
    if (item.hash === base || dirty) return;
    setTitle(item.title);
    setPriority(item.priority);
    setBody(item.body);
    setBase(item.hash);
  }, [item.hash]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const out = await api('PUT', B(pid, item.id), { title, priority, body, hash: base });
      setBase(out.hash);
      toast('已保存', 'ok');
      onSaved();
    } catch (e) {
      toast(e.message);
      if (e.status === 409 && e.data?.item) {
        const it = e.data.item;
        setTitle(it.title);
        setPriority(it.priority);
        setBody(it.body);
        setBase(it.hash);
      }
    } finally {
      setSaving(false);
    }
  };
  useSaveKey(save);

  const onPaste = async (e) => {
    const f = imageFromEvent(e);
    if (!f) return;
    e.preventDefault();
    try {
      const out = await api('POST', `${B(pid, item.id)}/images`, f);
      insertAtCursor(ref.current, `![截图](${out.path})`, setBody);
    } catch (err) {
      toast(err.message);
    }
  };

  const remove = async () => {
    if (!window.confirm(`删除规划「${item.title}」？图片也会一起删掉，不能撤销。`)) return;
    try {
      onDeleted(await api('DELETE', B(pid, item.id)));
    } catch (err) {
      toast(err.message);
    }
  };

  const close = () => {
    if (!dirty || window.confirm('放弃没保存的修改？')) onClose();
  };

  return (
    <aside className="bpanel" aria-label="编辑规划">
      <div className="bpanel-head">
        <span className="mono muted">docs/backlog/{item.id}.md</span>
        <button type="button" className="icon-btn" onClick={close} aria-label="关闭">×</button>
      </div>
      <label className="field">
        <span>标题</span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="field">
        <span>优先级</span>
        <div className="seg" role="radiogroup" aria-label="优先级">
          {Object.entries(PRIORITY).map(([k, v]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={priority === k}
              className={`seg-btn tone-${v.tone}${priority === k ? ' on' : ''}`}
              onClick={() => setPriority(k)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      <div className="field grow">
        <span className="field-row">
          描述
          <button type="button" className="link-btn" onClick={() => setPreview(!preview)}>{preview ? '编辑' : '预览'}</button>
        </span>
        {preview ? (
          <div className="bpanel-preview"><Markdown text={body || '（空）'} resolveImage={resolveImage} /></div>
        ) : (
          <textarea
            ref={ref}
            className="input area"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onPaste={onPaste}
            placeholder="写需求、背景、验收标准；可以直接 ⌘V 粘贴截图"
          />
        )}
      </div>
      <div className="bpanel-foot">
        <button type="button" className="btn danger ghost" onClick={remove}>删除</button>
        <span className="grow" />
        <button type="button" className="btn" onClick={onStart} disabled={dirty} title={dirty ? '先保存再开始' : undefined}>开始</button>
        <button type="button" className="btn primary" onClick={save} disabled={!dirty || saving}>{saving ? '保存中…' : '保存 ⌘S'}</button>
      </div>
    </aside>
  );
}
