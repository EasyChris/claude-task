// 草稿的 AI 会话状态：接口数据 + 实时事件（流式文字、正在读的文件）
import { useCallback, useState } from 'react';
import { B, api } from '../api.js';
import { useAiEvents, useData } from '../hooks.js';

export function useDraftChat(pid, id, version) {
  const { data, error, reload } = useData(`${B(pid, id)}/chat`, version);
  const [live, setLive] = useState({ text: '', tools: [] });

  useAiEvents((d) => {
    if (d.project !== pid || d.id !== id) return;
    if (d.kind === 'start') setLive({ text: '', tools: [] });
    else if (d.kind === 'delta') setLive((s) => ({ ...s, text: (s.text + d.text).slice(-1500) }));
    else if (d.kind === 'tool') setLive((s) => ({ ...s, tools: [...s.tools.slice(-5), `${d.name} ${d.target}`] }));
    else if (d.kind === 'done' || d.kind === 'error') {
      setLive({ text: '', tools: [] });
      reload();
    }
  });

  const send = useCallback(async (body) => {
    setLive({ text: '', tools: [] });
    await api('POST', `${B(pid, id)}/ai`, body);
    reload();
  }, [pid, id, reload]);

  const stop = useCallback(() => api('POST', `${B(pid, id)}/ai/stop`), [pid, id]);

  return { data, error, reload, live, send, stop };
}
