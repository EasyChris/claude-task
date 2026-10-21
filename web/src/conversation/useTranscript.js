// 增量拉会话原文：记住读到的字节位置，进行中的会话 2 秒拉一次，其余 15 秒看一眼（会话可能被 --resume 接着跑）
import { useEffect, useRef, useState } from 'react';
import { P, get } from '../api.js';

const LIVE_POLL = 2000;
const IDLE_POLL = 15000;

export function useTranscript(pid, sid) {
  const [state, setState] = useState({ items: [], loading: true, live: false, error: null });
  const pos = useRef(0);

  useEffect(() => {
    let stop = false;
    let timer;
    pos.current = 0;
    setState({ items: [], loading: true, live: false, error: null });

    const pull = async () => {
      try {
        for (;;) {
          const r = await get(`${P(pid)}/transcripts/${encodeURIComponent(sid)}?from=${pos.current}`);
          if (stop) return;
          pos.current = r.next;
          setState((s) => ({ items: r.items.length ? [...s.items, ...r.items] : s.items, loading: r.more, live: r.live, error: null }));
          if (!r.more) {
            timer = setTimeout(pull, r.live ? LIVE_POLL : IDLE_POLL);
            return;
          }
        }
      } catch (e) {
        if (!stop) setState((s) => ({ ...s, loading: false, error: e }));
      }
    };
    pull();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [pid, sid]);

  return state;
}
