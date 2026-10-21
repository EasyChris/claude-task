// 任务详情里的「完整对话」：这个任务关联了哪些 Claude Code 会话
import { T } from '../api.js';
import { useData } from '../hooks.js';
import { Link, convPath } from '../router.jsx';

const HOW = { record: '已记录', edit: '改过这个文件', shell: '用命令写过' };
const when = (ts) => (ts ? new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '?');
// 同一天结束只显示时分，跨天显示日期
const range = (a, b) => {
  const [x, y] = [when(a), when(b)];
  return `${x} → ${x.slice(0, 5) === y.slice(0, 5) ? y.slice(-5) : y}`;
};

export default function ConversationList({ pid, taskId, version }) {
  const { data, error } = useData(`${T(pid, taskId)}/conversations`, version);
  if (error || !data) return null;
  const { sessions } = data;
  return (
    <section className="convs" aria-labelledby="convs-title">
      <h2 id="convs-title" className="section-title">
        完整对话 <span className="muted mono">{sessions.length}</span>
      </h2>
      {!sessions.length ? (
        <p className="hint">
          还没有关联的会话。新开的 Claude 会话会把会话 id 记进 frontmatter 的 sessions 字段；以前的任务按「会话里改过这个文件」来找。
        </p>
      ) : (
        <ul className="conv-list">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link to={convPath(pid, taskId, s.id)} className="conv-row">
                <span className="conv-when mono">{range(s.start, s.end)}</span>
                <span className="conv-first">{s.first || <span className="muted">（没有开场消息）</span>}</span>
                {s.live && <span className="pill tone-active">进行中</span>}
                <span className="tag" title="怎么关联上的">{HOW[s.how] || s.how}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
