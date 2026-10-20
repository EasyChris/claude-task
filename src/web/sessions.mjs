// 会话记录（只读）：记忆目录下 sessions/*.md，也认旧项目放在记忆目录根下的 session-*.md
import fs from 'node:fs';
import path from 'node:path';
import { memoryDir } from '../util.mjs';
import { HttpError, readTextOr, safeReaddir } from './fsutil.mjs';

// 和 hook、Claude Code auto memory 同一个目录
export const projectMemoryDir = (root) => memoryDir(root);

function names(mem) {
  const inDir = safeReaddir(path.join(mem, 'sessions')).filter((f) => f.endsWith('.md')).map((f) => `sessions/${f}`);
  const legacy = safeReaddir(mem).filter((f) => /^session[-_].*\.md$/i.test(f));
  return [...inDir, ...legacy];
}

// 文件名里有日期就按日期排，没有就按修改时间
function sortKey(name, mtimeMs) {
  const m = /(\d{4}-\d{2}-\d{2})(?:-(\d+))?/.exec(name);
  return m ? `${m[1]}-${(m[2] || '00').padStart(2, '0')}` : new Date(mtimeMs).toISOString().slice(0, 10);
}

function readAll(root) {
  const mem = projectMemoryDir(root);
  return names(mem).flatMap((name) => {
    const file = path.join(mem, name);
    try {
      const st = fs.statSync(file);
      const text = readTextOr(file, '');
      const title = (/^#\s+(.+)$/m.exec(text)?.[1] || path.basename(name, '.md')).replace(/^Session\s+/i, '');
      return [{ name, title, updated: st.mtimeMs, key: sortKey(name, st.mtimeMs), text }];
    } catch {
      return [];
    }
  }).sort((a, b) => b.key.localeCompare(a.key) || b.updated - a.updated);
}

export function listSessions(root) {
  return readAll(root).map(({ text, ...rest }) => rest);
}

export function getSession(root, name) {
  const s = readAll(root).find((x) => x.name === name);
  if (!s) throw new HttpError(404, '没有这份会话记录');
  return { name: s.name, title: s.title, updated: s.updated, content: s.text };
}

export function relatedSessions(root, date, num) {
  const needle = new RegExp(`${date}/task-${num}(?![0-9])`);
  return readAll(root).filter((s) => needle.test(s.text)).map(({ name, title }) => ({ name, title }));
}
