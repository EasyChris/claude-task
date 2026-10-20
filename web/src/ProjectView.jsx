import { useState } from 'react';
import { api } from './api.js';
import Backlog from './pages/Backlog.jsx';
import Board from './pages/Board.jsx';
import History from './pages/History.jsx';
import Sessions from './pages/Sessions.jsx';
import TaskDetail from './pages/TaskDetail.jsx';
import { Link, navigate, projectPath } from './router.jsx';
import { KIND } from './status.js';
import { ErrorBox, useToast } from './ui.jsx';

const TABS = [
  ['board', '看板'],
  ['backlog', '规划'],
  ['history', '历史'],
  ['sessions', '会话记录'],
];

export default function ProjectView({ project, route, search, version, onRemoved }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const pid = project.id;

  const remove = async () => {
    if (!window.confirm(`把「${project.name}」移出列表？\n只是不在这里显示，项目里的文件不会动。`)) return;
    try {
      await api('DELETE', `/api/projects/${encodeURIComponent(pid)}`);
      navigate('/');
      onRemoved();
    } catch (e) {
      toast(e.message);
    }
  };

  if (project.missing) {
    return (
      <div className="page">
        <ErrorBox error={{ message: `项目目录不存在了：${project.path}` }} />
        <button type="button" className="btn" onClick={remove}>从列表移出</button>
      </div>
    );
  }

  const searchSubmit = (e) => {
    e.preventDefault();
    const v = q.trim();
    navigate(projectPath(pid, 'history', v ? `?q=${encodeURIComponent(v)}` : ''));
    setQ('');
  };

  let page;
  if (route.name === 'task') page = <TaskDetail pid={pid} id={route.taskId} version={version} />;
  else if (route.name === 'backlog') page = <Backlog pid={pid} version={version} />;
  else if (route.name === 'history') page = <History pid={pid} version={version} search={search} />;
  else if (route.name === 'sessions') page = <Sessions pid={pid} version={version} search={search} />;
  else page = <Board pid={pid} version={version} />;

  const tab = route.name === 'task' ? null : route.name;
  const backlogCount = project.counts?.backlog || 0;

  return (
    <div className="project">
      <header className="project-head">
        <div className="project-title">
          <h1>{project.name}</h1>
          <span className="project-path mono" title={project.path}>{project.path}</span>
          {project.kind && <span className="tag">{KIND[project.kind]}</span>}
        </div>
        <div className="project-bar">
          <nav className="tabs" aria-label="项目页面">
            {TABS.map(([k, label]) => (
              <Link
                key={k}
                to={projectPath(pid, k)}
                className={`tab${tab === k ? ' active' : ''}`}
                aria-current={tab === k ? 'page' : undefined}
              >
                {label}
                {k === 'backlog' && backlogCount > 0 && <span className="tab-count mono">{backlogCount}</span>}
              </Link>
            ))}
          </nav>
          <form className="head-search" role="search" onSubmit={searchSubmit}>
            <input
              className="input"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索本项目（标题和正文）"
              aria-label="搜索本项目"
            />
          </form>
          <button type="button" className="btn ghost small" onClick={remove} title="只是不在这里显示，不动项目文件">
            移出列表
          </button>
        </div>
      </header>
      {page}
    </div>
  );
}
