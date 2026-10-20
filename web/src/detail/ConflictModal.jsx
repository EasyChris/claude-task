import { useMemo, useState } from 'react';
import { collapse, lineDiff } from '../diff.js';
import { Modal } from '../ui.jsx';

// 「文件里现在的内容」→「你的版本」的差异
export default function ConflictModal({ name, mine, theirs, onReload, onOverwrite, onClose }) {
  const [show, setShow] = useState(false);
  const diff = useMemo(() => (show ? lineDiff(theirs, mine) : null), [show, theirs, mine]);

  return (
    <Modal
      title={`${name} 在你编辑期间被改过了`}
      onClose={onClose}
      wide
      footer={(
        <>
          <button type="button" className="btn" onClick={() => setShow(!show)}>{show ? '收起差异' : '查看差异'}</button>
          <button type="button" className="btn" onClick={onReload}>放弃我的修改并重新加载</button>
          <button type="button" className="btn danger" onClick={onOverwrite}>仍然覆盖</button>
        </>
      )}
    >
      <p>多半是 Claude 在终端里同时改了这个文件。「仍然覆盖」会用你的版本替换掉对方刚写的内容。</p>
      {show && diff && (
        <pre className="diff mono" aria-label="差异：减号是文件里现在有、你的版本没有的">
          {collapse(diff).map(([t, line], k) => (
            <div key={k} className={`diff-row d-${t === ' ' ? 'same' : t === '+' ? 'add' : t === '-' ? 'del' : 'skip'}`}>
              <span className="diff-mark">{t === '…' ? ' ' : t}</span>
              {line || ' '}
            </div>
          ))}
        </pre>
      )}
      {show && !diff && <p className="muted">文件太大，算不出差异。</p>}
      {show && diff && <p className="hint">− 文件里现在的内容　＋ 你的版本</p>}
    </Modal>
  );
}
