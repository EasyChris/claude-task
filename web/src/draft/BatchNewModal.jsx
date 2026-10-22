// 批量新建草稿：贴一大段文字 → 预览拆成了哪几条（可改标题 / 内容、删掉某条）→ 一次建好（只收文字，不收图片）
import { useState } from 'react';
import { P, api } from '../api.js';
import { Modal, useToast } from '../ui.jsx';
import { splitDrafts } from './split.js';

export default function BatchNewModal({ pid, onClose, onCreated }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);

  const preview = () => {
    const xs = splitDrafts(text);
    if (!xs.length) return toast('先贴点需求进来');
    setItems(xs);
  };
  const edit = (i, patch) => setItems(items.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  const create = async () => {
    if (items.some((x) => !x.title.trim())) return toast('有一条标题是空的');
    setBusy(true);
    try {
      const out = await api('POST', `${P(pid)}/backlog/batch`, { items });
      toast(`已建好 ${out.items.length} 条草稿`, 'ok');
      onCreated();
      onClose();
    } catch (e) {
      toast(e.message);
      setBusy(false);
    }
  };

  const footer = items ? (
    <>
      <span className="hint batch-count">共 {items.length} 条</span>
      <button type="button" className="btn" disabled={busy} onClick={() => setItems(null)}>← 回去改原文</button>
      <button type="button" className="btn primary" disabled={busy || !items.length} onClick={create}>建 {items.length} 条草稿</button>
    </>
  ) : (
    <>
      <span className="hint batch-count">用空行分隔；某条里要有空行的话，条与条之间改用单独一行 ---</span>
      <button type="button" className="btn primary" disabled={!text.trim()} onClick={preview}>预览拆分</button>
    </>
  );

  return (
    <Modal title="批量新建草稿" onClose={onClose} wide footer={footer}>
      {items ? (
        <ol className="batch-list">
          {items.map((x, i) => (
            <li key={i}>
              <div className="batch-head">
                <span className="mono muted">{i + 1}</span>
                <input className="input grow" value={x.title} onChange={(e) => edit(i, { title: e.target.value })} aria-label={`第 ${i + 1} 条标题`} />
                <button type="button" className="btn small danger ghost" onClick={() => setItems(items.filter((_, k) => k !== i))}>删掉</button>
              </div>
              <textarea className="input area" value={x.body} onChange={(e) => edit(i, { body: e.target.value })} aria-label={`第 ${i + 1} 条内容`} rows={3} />
            </li>
          ))}
        </ol>
      ) : (
        <label className="field">
          <span>需求（一次贴多条，标题取每段第一行）</span>
          <textarea
            className="input area tall"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'库存页加导出 Excel\n销售要带筛选条件导出\n\n登录页记住密码\n\n…'}
            autoFocus
          />
        </label>
      )}
    </Modal>
  );
}
