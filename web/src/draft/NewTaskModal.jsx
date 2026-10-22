// 新建任务：贴需求文字、贴图，存成草稿；或者直接让 AI 整理
import { useRef, useState } from 'react';
import { B, P, api, imageResolver } from '../api.js';
import { imageFromEvent, insertAtCursor } from '../paste.js';
import { navigate, draftPath } from '../router.jsx';
import { PRIORITY } from '../status.js';
import { Modal, useToast } from '../ui.jsx';

export default function NewTaskModal({ pid, onClose, onCreated }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [body, setBody] = useState('');
  const [useProject, setUseProject] = useState(true);
  const [busy, setBusy] = useState(false);
  // 贴图要先有规划文件才能存图：第一次贴图时就建好草稿
  const [draftId, setDraftId] = useState(null);
  const [images, setImages] = useState([]);
  const ref = useRef(null);
  const resolveImage = imageResolver(pid, 'docs/backlog');

  const ensureDraft = async () => {
    if (draftId) return draftId;
    const d = await api('POST', `${P(pid)}/backlog`, { title: title.trim() || '未命名任务', priority, body: '' });
    setDraftId(d.id);
    return d.id;
  };

  const addImage = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const id = await ensureDraft();
      const out = await api('POST', `${B(pid, id)}/images`, file);
      setImages((xs) => [...xs, out.path]);
      if (ref.current) insertAtCursor(ref.current, `\n![截图](${out.path})\n`, setBody);
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onPaste = (e) => {
    const f = imageFromEvent(e);
    if (f) {
      e.preventDefault();
      addImage(f);
    }
  };

  const save = async (withAi) => {
    if (!title.trim() && !body.trim()) return toast('写个标题或贴点需求进来');
    setBusy(true);
    try {
      const t = title.trim() || body.trim().split('\n')[0].replace(/^[#\s>*-]+/, '').slice(0, 30) || '未命名任务';
      let id = draftId;
      if (id) {
        const cur = await api('GET', `${P(pid)}/backlog`).then((r) => r.items.find((i) => i.id === id));
        await api('PUT', B(pid, id), { title: t, priority, body, hash: cur?.hash });
      } else {
        id = (await api('POST', `${P(pid)}/backlog`, { title: t, priority, body })).id;
      }
      if (withAi) await api('POST', `${B(pid, id)}/ai`, { useProject });
      onCreated();
      navigate(draftPath(pid, id));
    } catch (e) {
      toast(e.message);
      setBusy(false);
    }
  };

  // 关掉时如果已经因为贴图建了空草稿，保留它（图片已经存了），提示一句
  const close = () => {
    if (draftId) toast('已存成草稿，在规划里能找到', 'ok');
    if (draftId) onCreated();
    onClose();
  };

  return (
    <Modal
      title="新建任务"
      onClose={close}
      wide
      footer={(
        <>
          <label className="check-line">
            <input type="checkbox" checked={useProject} onChange={(e) => setUseProject(e.target.checked)} />
            AI 参考项目代码和历史任务（只读，20~60 秒）
          </label>
          <button type="button" className="btn" disabled={busy} onClick={() => save(false)}>存为草稿</button>
          <button type="button" className="btn primary" disabled={busy} onClick={() => save(true)}>✨ AI 整理</button>
        </>
      )}
    >
      <div className="new-task">
        <div className="new-row">
          <label className="field grow">
            <span>标题（可以不填，AI 会起）</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="比如：库存页加导出 Excel" />
          </label>
          <label className="field">
            <span>优先级</span>
            <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
        </div>
        <label className="field">
          <span>需求</span>
          <textarea
            ref={ref}
            className="input area tall"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onPaste={onPaste}
            placeholder="把需求直接贴进来，或者随便写几句；⌘V 可以贴截图"
            autoFocus
          />
        </label>
        <div
          className="new-images"
          onDragOver={(e) => [...e.dataTransfer.types].includes('Files') && e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addImage(imageFromEvent(e));
          }}
        >
          {images.map((src) => <img key={src} src={resolveImage(src)} alt="" />)}
          <span className="muted">{busy ? '处理中…' : '拖入图片，或在上面 ⌘V'}</span>
        </div>
      </div>
    </Modal>
  );
}
