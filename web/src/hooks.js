import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { get } from './api.js';

// 实时同步：服务端监听文件变化，通过 SSE 告诉页面「哪个项目变了」
export const LiveContext = createContext({ versions: {}, projects: 0, connected: false });

export function useLiveProvider() {
  const [state, setState] = useState({ versions: {}, projects: 0, connected: false });
  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onopen = () => setState((s) => ({ ...s, connected: true }));
    es.onerror = () => setState((s) => ({ ...s, connected: false }));
    es.addEventListener('change', (e) => {
      const { project } = JSON.parse(e.data);
      setState((s) => ({ ...s, versions: { ...s.versions, [project]: (s.versions[project] || 0) + 1 } }));
    });
    es.addEventListener('projects', () => setState((s) => ({ ...s, projects: s.projects + 1 })));
    return () => es.close();
  }, []);
  return state;
}

export const useLive = () => useContext(LiveContext);

// GET 一个接口；version 变了就重新拉（实时同步用），旧请求的结果晚到会被丢掉
export function useData(url, version) {
  const [state, setState] = useState({ data: null, error: null });
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!url) return;
    const n = ++seq.current;
    try {
      const data = await get(url);
      if (n === seq.current) setState({ data, error: null });
    } catch (error) {
      if (n === seq.current) setState((s) => ({ ...s, error }));
    }
  }, [url]);
  useEffect(() => {
    load();
  }, [load, version]);
  const setData = useCallback((data) => {
    seq.current++;
    setState({ data, error: null });
  }, []);
  return { ...state, reload: load, setData };
}

// ⌘S / Ctrl+S
export function useSaveKey(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        ref.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function localDay(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
