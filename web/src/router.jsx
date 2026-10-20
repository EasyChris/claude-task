// 极简路由：history API + 几条固定路径
import { useEffect, useState } from 'react';

const listeners = new Set();

export function navigate(to, { replace = false } = {}) {
  window.history[replace ? 'replaceState' : 'pushState'](null, '', to);
  listeners.forEach((fn) => fn());
  if (!replace) window.scrollTo(0, 0);
}

const current = () => ({ path: window.location.pathname, search: window.location.search });

export function useLocation() {
  const [loc, setLoc] = useState(current);
  useEffect(() => {
    const fn = () => setLoc(current());
    listeners.add(fn);
    window.addEventListener('popstate', fn);
    return () => {
      listeners.delete(fn);
      window.removeEventListener('popstate', fn);
    };
  }, []);
  return loc;
}

const dec = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export function matchRoute(path) {
  let m = /^\/p\/([^/]+)\/t\/([^/]+)\/?$/.exec(path);
  if (m) return { name: 'task', pid: dec(m[1]), taskId: dec(m[2]) };
  m = /^\/p\/([^/]+)\/(board|backlog|history|sessions)\/?$/.exec(path);
  if (m) return { name: m[2], pid: dec(m[1]) };
  m = /^\/p\/([^/]+)\/?$/.exec(path);
  if (m) return { name: 'board', pid: dec(m[1]) };
  return { name: 'overview' };
}

export const projectPath = (pid, tab = 'board', query = '') => `/p/${encodeURIComponent(pid)}/${tab}${query}`;
export const taskPath = (pid, id) => `/p/${encodeURIComponent(pid)}/t/${encodeURIComponent(id)}`;

export function Link({ to, children, onClick, ...rest }) {
  const handle = (e) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={handle} {...rest}>
      {children}
    </a>
  );
}
