// 左侧：原稿 / 对话记录 + 正在整理的实时进度 + 输入框
import { useEffect, useRef, useState } from 'react';
import Markdown from '../Markdown.jsx';
import { imageFromEvent } from '../paste.js';

export default function ChatPanel({ chat, running, queued, live, onSend, onStop, onImage, resolveImage }) {
  const [msg, setMsg] = useState('');
  const endRef = useRef(null);
  const messages = chat?.messages || [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, live.text, live.tools.length]);

  const submit = async (e) => {
    e.preventDefault();
    const text = msg.trim();
    if (!text || running) return;
    if (await onSend({ message: text })) setMsg('');
  };

  const onPaste = async (e) => {
    const f = imageFromEvent(e);
    if (!f) return;
    e.preventDefault();
    const link = await onImage(f);
    if (link) setMsg((m) => `${m}${m ? '\n' : ''}${link}`);
  };

  return (
    <section className="chat" aria-label="对话">
      {chat?.original !== undefined && (
        <details className="original" open={!messages.length}>
          <summary>你的原稿</summary>
          <Markdown text={chat.original || '（空）'} resolveImage={resolveImage} />
        </details>
      )}
      <ol className="msgs">
        {messages.map((m, i) => (
          <li key={i} className={`msg ${m.role}`}>
            <span className="msg-who" aria-hidden="true">{m.role === 'user' ? '你' : m.role === 'assistant' ? 'AI' : '·'}</span>
            <div className="msg-text"><Markdown text={m.text} resolveImage={resolveImage} /></div>
          </li>
        ))}
        {(running || queued) && (
          <li className="msg assistant pending" aria-live="polite">
            <span className="msg-who" aria-hidden="true">AI</span>
            <div className="msg-text">
              <div className="thinking">{queued ? '排队中，前面的整理完自动开始' : '整理中'}<span className="dots" aria-hidden="true" /></div>
              {live.tools.map((t, i) => <div key={i} className="tool-line mono">↳ {t}</div>)}
              {live.text && <div className="live-text">{live.text}</div>}
            </div>
          </li>
        )}
        {chat?.lastError && !running && !queued && (
          <li className="msg error" role="alert">
            <span className="msg-who" aria-hidden="true">!</span>
            <div className="msg-text">{chat.lastError}</div>
          </li>
        )}
      </ol>
      <div ref={endRef} />
      <form className="chat-input" onSubmit={submit}>
        <textarea
          className="input"
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
          }}
          placeholder={messages.length ? '继续说：哪里要改、补充什么…（⌘↩ 发送，可以贴图）' : '想补充的说明（可选）'}
          rows={3}
          disabled={running || queued}
          aria-label="给 AI 的消息"
        />
        <div className="chat-actions">
          {running || queued
            ? <button type="button" className="btn" onClick={onStop}>⏹ 停止</button>
            : <button type="submit" className="btn primary" disabled={!msg.trim()}>发送</button>}
        </div>
      </form>
    </section>
  );
}
