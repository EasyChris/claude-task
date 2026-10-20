import { useEffect, useMemo, useState } from 'react';
import { P } from '../api.js';
import { useData } from '../hooks.js';
import { Link, navigate, projectPath, taskPath } from '../router.jsx';
import { STATUS, cleanNote } from '../status.js';
import { Empty, ErrorBox, Loading, Progress, StatusPill, shortDate } from '../ui.jsx';

export default function History({ pid, version, search }) {
  const q = new URLSearchParams(search).get('q') || '';
  const [input, setInput] = useState(q);
  const [status, setStatus] = useState('');
  const [month, setMonth] = useState('');
  useEffect(() => setInput(q), [q]);

  const url = `${P(pid)}/tasks${q ? `?q=${encodeURIComponent(q)}` : ''}`;
  const { data, error, reload } = useData(url, version);

  const all = data?.tasks || [];
  const months = useMemo(() => [...new Set(all.map((t) => t.date.slice(0, 7)))], [all]);
  const statuses = useMemo(() => [...new Set(all.map((t) => t.status))], [all]);
  const shown = all.filter((t) => (!status || t.status === status) && (!month || t.date.startsWith(month)));
  const groups = useMemo(() => {
    const m = new Map();
    for (const t of shown) {
      const k = t.date.slice(0, 7);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(t);
    }
    return [...m];
  }, [shown]);

  const submit = (e) => {
    e.preventDefault();
    const v = input.trim();
    navigate(projectPath(pid, 'history', v ? `?q=${encodeURIComponent(v)}` : ''), { replace: true });
  };

  return (
    <div className="page">
      <form className="filters" role="search" onSubmit={submit}>
        <input
          className="input grow"
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="搜标题和正文，回车"
          aria-label="搜索任务"
        />
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="按状态筛选">
          <option value="">全部状态</option>
          {statuses.map((s) => <option key={s} value={s}>{STATUS[s]?.label || s}</option>)}
        </select>
        <select className="input" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="按月份筛选">
          <option value="">全部月份</option>
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <span className="muted mono">{data ? `${shown.length} 个任务` : ''}</span>
      </form>

      {error && !data && <ErrorBox error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && !shown.length && <Empty title={q ? `没有找到「${q}」` : '没有符合条件的任务'} />}

      {groups.map(([m, items]) => (
        <section key={m} className="month">
          <h2 className="month-head">
            <span className="mono">{m}</span>
            <span className="muted mono">{items.length}</span>
          </h2>
          <ul className="hlist">
            {items.map((t) => (
              <li key={t.id}>
                <Link to={taskPath(pid, t.id)} className="hrow">
                  <span className="hrow-date mono">{shortDate(t.date)} #{t.num}</span>
                  <span className="hrow-main">
                    <span className="hrow-title">{t.title}</span>
                    {t.snippet && <span className="hrow-snippet">{t.snippet}</span>}
                  </span>
                  <span className="hrow-note">{t.status === 'done' && t.note ? cleanNote(t.note) : ''}</span>
                  <StatusPill status={t.status} inferred={t.inferred} />
                  <Progress {...t.progress} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
