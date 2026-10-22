import { Link, projectPath, taskPath } from '../router.jsx';
import { KIND } from '../status.js';
import { Empty, Progress, shortDate } from '../ui.jsx';

function Stat({ n, label, tone }) {
  return (
    <div className={`stat${n ? '' : ' zero'}${tone ? ` tone-${tone}` : ''}`}>
      <span className="stat-n mono">{n}</span>
      <span className="stat-l">{label}</span>
    </div>
  );
}

export default function Overview({ projects, onScan }) {
  if (!projects.length) {
    return (
      <div className="page">
        <h1 className="page-title">全部项目</h1>
        <Empty title="还没有项目">
          <p>点下面的按钮扫描 <span className="mono">~/code</span> 这类目录，把已有 docs/tasks 的项目加进来；</p>
          <p>或者在项目目录里运行 <code>npx claude-task init</code>。</p>
          <button type="button" className="btn primary" onClick={onScan}>扫描目录</button>
        </Empty>
      </div>
    );
  }

  const active = projects.flatMap((p) => (p.active || []).map((t) => ({ ...t, pid: p.id, pname: p.name })));
  const awaiting = projects.reduce((n, p) => n + (p.counts?.awaiting || 0), 0);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">全部项目</h1>
        <span className="muted mono">{projects.length} 个项目</span>
      </div>

      <section className="cards" aria-label="项目">
        {projects.map((p) => (
          <Link key={p.id} to={projectPath(p.id)} className={`pcard${p.missing ? ' missing' : ''}`}>
            <div className="pcard-head">
              <span className="pcard-name">{p.name}</span>
              {p.migrate
                ? <span className="pill tone-wait" title="在项目页能复制迁移命令">需要迁移</span>
                : p.kind && <span className="tag">{KIND[p.kind]}</span>}
            </div>
            {p.missing ? (
              <p className="muted">目录不存在了</p>
            ) : (
              <>
                <div className="stats">
                  <Stat n={p.counts.active} label="进行中" tone="active" />
                  <Stat n={p.counts.queue} label="执行队列" tone="wait" />
                  <Stat n={p.counts.doneMonth} label="本月完成" tone="done" />
                </div>
                <div className="pcard-foot mono">
                  <span>{p.counts.total} 个任务</span>
                  <span>最近 {p.last ? shortDate(p.last) : '—'}</span>
                </div>
              </>
            )}
          </Link>
        ))}
      </section>

      <section className="cross" aria-labelledby="cross-title">
        <h2 id="cross-title" className="section-title">
          正在进行 <span className="muted mono">{active.length}</span>
          {awaiting > 0 && <span className="pill tone-wait">{awaiting} 个待确认</span>}
        </h2>
        {active.length ? (
          <ul className="cross-list">
            {active.map((t) => (
              <li key={`${t.pid}-${t.id}`}>
                <Link to={taskPath(t.pid, t.id)} className="cross-row">
                  <span className="cross-project">{t.pname}</span>
                  <span className="cross-title">{t.title}</span>
                  <span className="cross-date mono">{shortDate(t.date)}</span>
                  <Progress {...t.progress} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">现在没有进行中的任务。</p>
        )}
      </section>
    </div>
  );
}
