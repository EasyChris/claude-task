// 右侧：AI 整理后的当前草稿（可手改）、本轮改动、待确认问题、确认按钮
import { useState } from 'react';
import { B, api } from '../api.js';
import { collapse, lineDiff } from '../diff.js';
import Markdown from '../Markdown.jsx';
import { useToast } from '../ui.jsx';

export default function DraftPane({ pid, item, chat, running, onSend, onApprove, onSaved, resolveImage }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);
  const [answers, setAnswers] = useState({});
  const [showDiff, setShowDiff] = useState(false);
  const questions = chat?.questions || [];
  const changed = chat?.prevBody !== undefined && chat.prevBody !== item.body;
  const filled = questions.map((q, i) => ({ q: q.q, a: (answers[i] || '').trim() })).filter((a) => a.a);

  const startEdit = () => {
    setTitle(item.title);
    setBody(item.body);
    setEditing(true);
  };
  const save = async () => {
    try {
      await api('PUT', B(pid, item.id), { title, body, priority: item.priority, hash: item.hash });
      setEditing(false);
      onSaved();
    } catch (e) {
      toast(e.message);
      if (e.status === 409) onSaved();
    }
  };

  return (
    <section className="draft-pane" aria-label="当前草稿">
      <div className="pane-bar">
        <span className="pane-label">当前草稿{chat?.rounds ? ` · 第 ${chat.rounds} 版` : ''}</span>
        {changed && !editing && (
          <button type="button" className="link-btn" onClick={() => setShowDiff(!showDiff)}>{showDiff ? '收起改动' : '本轮改动'}</button>
        )}
        {editing ? (
          <>
            <button type="button" className="btn small" onClick={() => setEditing(false)}>取消</button>
            <button type="button" className="btn small primary" onClick={save}>保存</button>
          </>
        ) : (
          <button type="button" className="btn small" onClick={startEdit} disabled={running}>手改</button>
        )}
      </div>

      {editing ? (
        <div className="pane-edit">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="标题" />
          <textarea className="input area tall mono" value={body} onChange={(e) => setBody(e.target.value)} aria-label="草稿正文" />
          <p className="hint">改完保存，AI 下一轮会在你改过的版本上继续。</p>
        </div>
      ) : (
        <div className={`pane-doc${running ? ' dim' : ''}`}>
          <h2 className="pane-title">{item.title}</h2>
          {showDiff && changed ? (
            <pre className="diff mono">
              {collapse(lineDiff(chat.prevBody, item.body)).map(([t, line], k) => (
                <div key={k} className={`diff-row d-${t === ' ' ? 'same' : t === '+' ? 'add' : t === '-' ? 'del' : 'skip'}`}>
                  <span className="diff-mark">{t === '…' ? ' ' : t}</span>{line || ' '}
                </div>
              ))}
            </pre>
          ) : (
            <Markdown text={item.body || '（空）'} resolveImage={resolveImage} />
          )}
        </div>
      )}

      {questions.length > 0 && !editing && (
        <div className="questions">
          <h3 className="q-head">待确认 {questions.length}</h3>
          <ol>
            {questions.map((q, i) => (
              <li key={i}>
                <label>
                  <span className="q-text">{q.q}</span>
                  <input
                    className="input"
                    value={answers[i] || ''}
                    onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })}
                    placeholder={q.suggestion ? `建议：${q.suggestion}（不填就按这个）` : '你的回答'}
                    disabled={running}
                  />
                </label>
              </li>
            ))}
          </ol>
          <button type="button" className="btn" disabled={running || !filled.length} onClick={() => onSend({ answers: filled })}>
            回答并重新整理
          </button>
        </div>
      )}

      <div className="pane-foot">
        <span className="hint">
          {questions.length ? '直接确认的话，没回答的按建议处理。' : '确认后转成今天的任务上看板，Claude 开工时不再等你确认。'}
        </span>
        <button type="button" className="btn primary" disabled={running || editing} onClick={onApprove}>
          ✓ 确认，上看板
        </button>
      </div>
    </section>
  );
}
