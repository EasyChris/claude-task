import { Link, projectPath } from './router.jsx';

export default function Sidebar({ projects, current, isOverview, connected, onScan }) {
  return (
    <aside className="sidebar">
      <Link to="/" className="brand">
        <img src="/favicon.svg" alt="" width="22" height="22" />
        <span>claude-task</span>
      </Link>

      <nav className="side-nav" aria-label="项目">
        <Link to="/" className={`side-link${isOverview ? ' active' : ''}`} aria-current={isOverview ? 'page' : undefined}>
          <span className="side-glyph" aria-hidden="true">▣</span>
          <span className="side-name">全部项目</span>
        </Link>

        <div className="side-label">项目</div>
        <ul className="side-list">
          {projects.map((p) => {
            const active = p.counts?.active || 0;
            const here = current === p.id;
            return (
              <li key={p.id}>
                <Link
                  to={projectPath(p.id)}
                  className={`side-link${here ? ' active' : ''}${p.missing ? ' missing' : ''}`}
                  aria-current={here ? 'page' : undefined}
                  title={p.missing ? `目录不存在：${p.path}` : p.path}
                >
                  <span className={`dot${active ? ' on' : ''}`} aria-hidden="true" />
                  <span className="side-name">{p.name}</span>
                  {active > 0 && <span className="side-count mono" aria-label={`${active} 个进行中`}>{active}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
        <button type="button" className="side-scan" onClick={onScan}>
          + 扫描目录
        </button>
      </nav>

      <div className={`live${connected ? ' on' : ''}`} role="status">
        <span className="live-dot" aria-hidden="true" />
        {connected ? '实时同步中' : '连接断开，正在重连…'}
      </div>
    </aside>
  );
}
