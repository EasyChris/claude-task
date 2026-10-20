// 编辑原文：左边 markdown、右边实时预览，⌘S 保存；保存前比对，文件被改过就弹冲突框
import { useRef, useState } from 'react';
import { T, api } from '../api.js';
import { useSaveKey } from '../hooks.js';
import Markdown, { stripFrontmatter } from '../Markdown.jsx';
import { imageFromEvent, insertAtCursor } from '../paste.js';
import { useToast } from '../ui.jsx';
import ConflictModal from './ConflictModal.jsx';

export default function RawEditor({ task, pid, resolveImage, onSaved, onCancel }) {
  const toast = useToast();
  const [text, setText] = useState(task.content);
  const [base, setBase] = useState(task.hash);
  const [conflict, setConflict] = useState(null);
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);
  const dirty = text !== task.content || base !== task.hash;

  const save = async (hash = base, content = text) => {
    if (saving) return;
    setSaving(true);
    try {
      const t = await api('PUT', `${T(pid, task.id)}/content`, { content, hash });
      toast('已保存', 'ok');
      onSaved(t);
    } catch (e) {
      if (e.status === 409 && e.data?.current !== undefined) setConflict({ current: e.data.current, hash: e.data.hash });
      else toast(e.message);
    } finally {
      setSaving(false);
    }
  };
  useSaveKey(() => !conflict && save());

  const cancel = () => {
    if (!dirty || window.confirm('放弃没保存的修改？')) onCancel();
  };

  // 粘贴图片：先存进 assets/，再在光标处插入链接（不自动追加到「## 附件」）
  const onPaste = async (e) => {
    const f = imageFromEvent(e);
    if (!f) return;
    e.preventDefault();
    try {
      const out = await api('POST', `${T(pid, task.id)}/images?append=0`, f);
      insertAtCursor(ref.current, `![截图](${out.path})`, setText);
    } catch (err) {
      toast(err.message);
    }
  };

  return (
    <div className="page editor-page">
      <div className="editor-bar">
        <span className="mono muted">{task.file}</span>
        <span className="editor-state">{dirty ? '有未保存的修改' : '没有修改'}</span>
        <button type="button" className="btn" onClick={cancel}>取消</button>
        <button type="button" className="btn primary" disabled={saving} onClick={() => save()}>
          {saving ? '保存中…' : '保存 ⌘S'}
        </button>
      </div>
      <div className="editor">
        <textarea
          ref={ref}
          className="editor-input mono"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          spellCheck={false}
          aria-label="markdown 原文"
          autoFocus
        />
        <div className="editor-preview" aria-label="预览">
          <Markdown text={stripFrontmatter(text)} resolveImage={resolveImage} />
        </div>
      </div>
      {conflict && (
        <ConflictModal
          name={task.file.split('/').pop()}
          mine={text}
          theirs={conflict.current}
          onReload={() => {
            setText(conflict.current);
            setBase(conflict.hash);
            setConflict(null);
          }}
          onOverwrite={() => {
            const { hash } = conflict;
            setConflict(null);
            setBase(hash);
            save(hash);
          }}
          onClose={() => setConflict(null)}
        />
      )}
    </div>
  );
}
