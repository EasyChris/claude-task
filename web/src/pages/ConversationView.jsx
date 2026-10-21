// 一个会话的完整对话（只读）；进行中的会话自动追加，停在底部时跟着滚
import { useEffect, useRef } from 'react';
import { T } from '../api.js';
import Conversation from '../conversation/Conversation.jsx';
import { useTranscript } from '../conversation/useTranscript.js';
import { useData } from '../hooks.js';
import { Link, taskPath } from '../router.jsx';
import { ErrorBox, Loading, useToast } from '../ui.jsx';

const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 120;

export default function ConversationView({ pid, taskId, sid, version }) {
  const toast = useToast();
  const { data: task } = useData(T(pid, taskId), version);
  const t = useTranscript(pid, sid);
  const follow = useRef(null); // null = 还没定；进行中的会话一打开就跟到底部

  useEffect(() => {
    const onScroll = () => {
      follow.current = atBottom();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (follow.current === null && !t.loading && t.items.length) follow.current = t.live;
    if (follow.current) window.scrollTo(0, document.documentElement.scrollHeight);
  }, [t.items.length, t.loading, t.live]);

  const resume = `claude --resume ${sid}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(resume);
      toast('已复制，在项目目录的终端里粘贴就能接着这个会话', 'ok');
    } catch {
      toast(resume);
    }
  };

  return (
    <div className="page detail conv-page">
      <div className="detail-top">
        <Link to={taskPath(pid, taskId)} className="back">← {task?.title || '任务'}</Link>
        <span className="mono muted">会话 {sid.slice(0, 8)}</span>
        {t.live && <span className="pill tone-active">进行中 · 自动更新</span>}
        <button type="button" className="btn small" onClick={copy} title={resume}>复制 claude --resume</button>
      </div>
      {t.error ? (
        <ErrorBox error={t.error} />
      ) : !t.items.length && t.loading ? (
        <Loading />
      ) : (
        <>
          <Conversation items={t.items} />
          {t.loading && <Loading text="还在读更早的内容…" />}
        </>
      )}
      <p className="hint conv-note">只读。原文在 Claude Code 的会话记录里；要接着做，复制上面的命令到终端。</p>
    </div>
  );
}
