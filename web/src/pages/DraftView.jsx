// 草稿页：左边对话，右边当前草稿；第一轮是一次性整理，之后可以回答问题或继续对话
import { useState } from 'react';
import { B, api, imageResolver } from '../api.js';
import ApproveModal from '../draft/ApproveModal.jsx';
import ChatPanel from '../draft/ChatPanel.jsx';
import DraftPane from '../draft/DraftPane.jsx';
import { useDraftChat } from '../draft/useDraftChat.js';
import { Link, navigate, projectPath, taskPath } from '../router.jsx';
import { Empty, ErrorBox, Loading, useToast } from '../ui.jsx';

export default function DraftView({ pid, id, version }) {
  const toast = useToast();
  const { data, error, reload, live, send, stop } = useDraftChat(pid, id, version);
  const [useProject, setUseProject] = useState(true);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (error && !data) {
    return (
      <div className="page">
        <ErrorBox error={error.status === 404 ? { message: '这条草稿已经不在了（可能已开始或删除）' } : error} onRetry={reload} />
        <Link to={projectPath(pid, 'backlog')} className="back">← 规划</Link>
      </div>
    );
  }
  if (!data) return <Loading />;

  const { item, chat, running, queued } = data;
  const resolveImage = imageResolver(pid, 'docs/backlog');
  const rounds = chat?.rounds || 0;

  if (item.status !== 'draft') {
    return (
      <div className="page">
        <Empty title="这条已经确认过了">
          <p>它已经转成任务，在看板「待开始」列里。</p>
          <Link to={projectPath(pid, 'board')} className="btn">去看板</Link>
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
  // 确认 = 转成今天的 task 文件上看板，然后跳到那个任务；有没回答的问题先弹窗问一下
  const doApprove = async () => {
    setBusy(true);
    try {
      const out = await api('POST', `${B(pid, id)}/approve`);
      toast('已确认，上了看板', 'ok');
      navigate(taskPath(pid, out.id));
    } catch (e) {
      toast(e.message);
      setBusy(false);
      setAsking(false);
      reload();
    }
  };
  const approve = () => (chat?.questions?.length ? setAsking(true) : doApprove());

  return (
    <div className="page draft-page">
      <div className="detail-top">
        <Link to={projectPath(pid, 'backlog')} className="back">← 规划</Link>
        <span className="mono muted">草稿 · docs/backlog/{item.id}.md</span>
        {!rounds && !running && !queued && (
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
          queued={queued}
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
          running={running || queued || busy}
          onSend={trySend}
          onApprove={approve}
          onSaved={reload}
          resolveImage={resolveImage}
        />
      </div>
      {asking && <ApproveModal questions={chat.questions} busy={busy} onOk={doApprove} onClose={() => setAsking(false)} />}
    </div>
  );
}
