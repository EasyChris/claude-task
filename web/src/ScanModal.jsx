import { useState } from 'react';
import { api, get } from './api.js';
import { KIND } from './status.js';
import { Modal, useToast } from './ui.jsx';

export default function ScanModal({ onClose, onAdded }) {
  const toast = useToast();
  const [dir, setDir] = useState('~/code');
  const [result, setResult] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [busy, setBusy] = useState(false);

  const scan = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const r = await get(`/api/scan?dir=${encodeURIComponent(dir)}`);
      setResult(r);
      setPicked(new Set(r.projects.filter((p) => !p.registered).map((p) => p.path)));
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (p) => {
    const next = new Set(picked);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setPicked(next);
  };

  const add = async () => {
    setBusy(true);
    try {
      await api('POST', '/api/projects', { paths: [...picked] });
      toast(`已加入 ${picked.size} 个项目`, 'ok');
      onAdded();
    } catch (err) {
      toast(err.message);
      setBusy(false);
    }
  };

  const candidates = result?.projects.filter((p) => !p.registered) || [];

  return (
    <Modal
      title="扫描目录"
      onClose={onClose}
      wide
      footer={(
        <>
          <span className="foot-note">扫描只读取文件，不会改动任何项目。</span>
          <button type="button" className="btn" onClick={onClose}>取消</button>
          <button type="button" className="btn primary" disabled={!picked.size || busy} onClick={add}>
            {picked.size ? `加入 ${picked.size} 个项目` : '加入项目'}
          </button>
        </>
      )}
    >
      <form className="scan-form" onSubmit={scan}>
        <label className="field">
          <span>目录</span>
          <input className="input mono" value={dir} onChange={(e) => setDir(e.target.value)} />
        </label>
        <button type="submit" className="btn" disabled={busy}>{busy && !result ? '扫描中…' : '扫描'}</button>
      </form>

      {result && (
        <>
          <div className="scan-summary">
            <span>
              在 <span className="mono">{result.dir}</span> 下找到 {result.projects.length} 个有 docs/tasks 的项目
            </span>
            {candidates.length > 0 && (
              <span className="scan-bulk">
                <button type="button" className="link-btn" onClick={() => setPicked(new Set(candidates.map((p) => p.path)))}>全选</button>
                <button type="button" className="link-btn" onClick={() => setPicked(new Set())}>清空</button>
              </span>
            )}
          </div>
          <ul className="scan-list">
            {result.projects.map((p) => (
              <li key={p.path} className={p.registered ? 'registered' : ''}>
                <label>
                  {p.registered
                    ? <span className="scan-check done" aria-hidden="true">✓</span>
                    : <input type="checkbox" checked={picked.has(p.path)} onChange={() => toggle(p.path)} />}
                  <span className="scan-name">{p.name}</span>
                  <span className="scan-count mono">{p.tasks} 个任务</span>
                  <span className="tag">{p.registered ? '已在列表里' : KIND[p.kind]}</span>
                  <span className="scan-path mono">{p.display}</span>
                </label>
              </li>
            ))}
          </ul>
          {!result.projects.length && <p className="muted">这个目录下（往下两层）没有找到 docs/tasks。</p>}
        </>
      )}
    </Modal>
  );
}
