// 确认前还有没回答的问题：列出问题和 AI 的建议答案，同意后按建议写进正文再确认
import { Modal } from '../ui.jsx';

export default function ApproveModal({ questions, busy, onOk, onClose }) {
  return (
    <Modal
      title={`还有 ${questions.length} 个问题没回答`}
      onClose={onClose}
      footer={(
        <>
          <span className="hint batch-count">同意的话按建议答案写进任务正文</span>
          <button type="button" className="btn" disabled={busy} onClick={onClose}>回去回答</button>
          <button type="button" className="btn primary" disabled={busy} onClick={onOk}>同意，按建议确认</button>
        </>
      )}
    >
      <ol className="approve-qs">
        {questions.map((q, i) => (
          <li key={i}>
            <span className="q-text">{q.q}</span>
            <span className="approve-sug">建议：{q.suggestion || '（未定，开工时再问）'}</span>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
