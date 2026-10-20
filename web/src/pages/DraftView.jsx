// 草稿页：左边对话，右边当前草稿；第一轮是一次性整理，之后可以回答问题或继续对话
import { useState } from 'react';
import { B, api, imageResolver } from '../api.js';
import ChatPanel from '../draft/ChatPanel.jsx';
import DraftPane from '../draft/DraftPane.jsx';
import { useDraftChat } from '../draft/useDraftChat.js';
import { Link, navigate, projectPath } from '../router.jsx';
import { Empty, ErrorBox, Loading, useToast } from '../ui.jsx';

export default function DraftView({ pid, id, version }) {
  const toast = useToast();
  const { data, error, reload, live, send, stop } = useDraftChat(pid, id, version);
  const [useProject, setUseProject] = useState(true);

  if (error && !data) {
    return (
      <div className="page">
        <ErrorBox error={error.status === 404 ? { message: '这条草稿已经不在了（可能已开始或删除）' } : error} onRetry={reload} />
        <Link to={projectPath(pid, 'backlog')} className="back">← 规划</Link>
      </div>
    );
  }
  if (!data) return <Loading />;

  const { item, chat, running } = data;
  const resolveImage = imageResolver(pid, 'docs/backlog');
  const rounds = chat?.rounds || 0;

  if (item.status !== 'draft') {
    return (
      <div className="page">
        <Empty title="这条已经确认过了">
          <p>它在待执行队列里，可以在规划页排序或点「开始」。</p>
          <Link to={projectPath(pid, 'backlog')} className="btn">去规划页</Link>
        </Empty>
      </div>
    );
  }

  const trySend = async (body) => {
    try {
      await send(body);
      return true;
    } catch (e) {
      toast(e.message);
      return false;
    }
  };
  const onImage = async (file) => {
    try {
      const out = await api('POST', `${B(pid, id)}/images`, file);
      return `![截图](${out.path})`;
    } catch (e) {
      toast(e.message);
      return null;
    }
  };
  const approve = async () => {
    try {
      await api('POST', `${B(pid, id)}/approve`);
      toast('已加入待执行队列', 'ok');
      navigate(projectPath(pid, 'backlog'));
    } catch (e) {
      toast(e.message);
    }
  };

  return (
    <div className="page draft-page">
      <div className="detail-top">
        <Link to={projectPath(pid, 'backlog')} className="back">← 规划</Link>
        <span className="mono muted">草稿 · docs/backlog/{item.id}.md</span>
        {!rounds && !running && (
          <span className="first-run">
            <label className="check-line">
              <input type="checkbox" checked={useProject} onChange={(e) => setUseProject(e.target.checked)} />
              参考项目代码和历史任务
            </label>
            <button type="button" className="btn primary" onClick={() => trySend({ useProject })}>✨ AI 整理</button>
          </span>
        )}
        {rounds > 0 && chat?.useProject === false && <span className="tag">不参考项目</span>}
      </div>
      <div className="draft-grid">
        <ChatPanel
          chat={chat || { original: item.body, messages: [] }}
          running={running}
          live={live}
          onSend={trySend}
          onStop={stop}
          onImage={onImage}
          resolveImage={resolveImage}
        />
        <DraftPane
          key={`${rounds}-${item.hash}`}
          pid={pid}
          item={item}
          chat={chat}
          running={running}
          onSend={trySend}
          onApprove={approve}
          onSaved={reload}
          resolveImage={resolveImage}
        />
      </div>
    </div>
  );
}
