// 任务附件：正文里引用的 assets/ 图片显示成缩略图；⌘V 粘贴、拖入或选文件上传
import { useEffect, useRef, useState } from 'react';
import { T, api } from '../api.js';
import { imageFromEvent, isTyping } from '../paste.js';
import { useToast } from '../ui.jsx';

const IMG_RE = /!\[([^\]]*)\]\(((?:\.\/)?assets\/[^)\s]+)\)/g;

export function attachmentsOf(content) {
  const seen = new Set();
  const out = [];
  for (const m of content.matchAll(IMG_RE)) {
    const src = m[2].replace(/^\.\//, '');
    if (!seen.has(src)) {
      seen.add(src);
      out.push({ src, alt: m[1] });
    }
  }
  return out;
}

export default function Attachments({ task, pid, resolveImage, onUploaded }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const fileRef = useRef(null);
  const items = attachmentsOf(task.content);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const out = await api('POST', `${T(pid, task.id)}/images`, file);
      onUploaded(out.task);
      toast('图片已保存', 'ok');
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };

  // 页面上任意位置 ⌘V（不在输入框里时）都算贴到附件
  const uploadRef = useRef(upload);
  uploadRef.current = upload;
  useEffect(() => {
    const onPaste = (e) => {
      if (isTyping(document.activeElement)) return;
      const f = imageFromEvent(e);
      if (f) {
        e.preventDefault();
        uploadRef.current(f);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  return (
    <section className="attachments" aria-labelledby="att-title">
      <h2 id="att-title" className="section-title">附件 <span className="muted mono">{items.length}</span></h2>
      <div className="att-grid">
        {items.map((a) => (
          <a key={a.src} href={resolveImage(a.src)} target="_blank" rel="noreferrer noopener" className="att">
            <img src={resolveImage(a.src)} alt={a.alt || a.src} loading="lazy" />
            <span className="att-name mono">{a.src.replace('assets/', '')}</span>
          </a>
        ))}
        <div
          className={`att-drop${over ? ' over' : ''}${busy ? ' busy' : ''}`}
          onDragOver={(e) => {
            if ([...e.dataTransfer.types].includes('Files')) {
              e.preventDefault();
              setOver(true);
            }
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            upload(imageFromEvent(e));
          }}
        >
          <span>{busy ? '上传中…' : '粘贴（⌘V）或拖入图片'}</span>
          <button type="button" className="link-btn" onClick={() => fileRef.current?.click()}>选择文件</button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            onChange={(e) => {
              upload(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </div>
    </section>
  );
}
