// 任务 ↔ 会话：task frontmatter 的 sessions 字段（hook 把会话 id 告诉 Claude）+ 会话里改过这个 task 文件
import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter.mjs';
import { safeReaddir } from './fsutil.mjs';
import { LIVE_MS, SESSION_RE, cleanUserText, transcriptDir } from './transcript.mjs';

const TASK_PATH = /docs\/tasks\/(\d{4}-\d{2}-\d{2})\/task-(\d+)[^/\s'"]*\.md/g;
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
// 命令里提到 task 文件、而且像是在写它（sed -i、重定向、python 写文件…）才算；只是 cat / grep 不算
const SHELL_WRITE = /sed -i|(?<![2&])>>?\s*(?!\/dev\/null)[^\s&|]|open\([^)]*,\s*['"][wa]|writeFile|\.write\(|\btee\b/;
const cache = new Map(); // 会话文件 → { key, info }；按修改时间和大小失效

function firstPrompt(x) {
  const c = x.message?.content;
  const s = typeof c === 'string' ? c : Array.isArray(c) ? c.find((b) => b.type === 'text')?.text || '' : '';
  return s.startsWith('<') ? '' : cleanUserText(s).replace(/\s+/g, ' ').slice(0, 120);
}

function scan(file) {
  const touched = new Map(); // task id → 'edit' | 'shell'
  let start = null;
  let first = '';
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    // 大文件逐行 JSON.parse 太慢：只解析开头几行（拿时间和第一句）和提到 docs/tasks/ 的行
    if (!line || (start && first && !line.includes('docs/tasks/'))) continue;
    let x;
    try {
      x = JSON.parse(line);
    } catch {
      continue;
    }
    start ??= x.timestamp || null;
    if (x.isSidechain || x.isMeta) continue;
    if (!first && x.type === 'user') first = firstPrompt(x);
    if (x.type !== 'assistant' || !Array.isArray(x.message?.content)) continue;
    for (const b of x.message.content) {
      if (b.type !== 'tool_use') continue;
      const edit = WRITE_TOOLS.has(b.name);
      const target = edit ? String(b.input?.file_path || b.input?.notebook_path || '')
        : b.name === 'Bash' && SHELL_WRITE.test(b.input?.command || '') ? String(b.input.command) : '';
      for (const m of target.matchAll(TASK_PATH)) {
        const id = `${m[1]}-${m[2].padStart(2, '0')}`;
        if (edit || !touched.has(id)) touched.set(id, edit ? 'edit' : 'shell');
      }
    }
  }
  return { start, first, touched };
}

function info(file, st) {
  const key = `${st.mtimeMs}:${st.size}`;
  const hit = cache.get(file);
  if (hit?.key === key) return hit.info;
  const out = scan(file);
  cache.set(file, { key, info: out });
  return out;
}

export function linkedSessions(root, task) {
  const recorded = String(parseFrontmatter(task.content).data?.sessions || '').split(/[,\s]+/).filter((s) => SESSION_RE.test(s));
  const want = new Set(recorded);
  // 任务当天之前就没再动过的会话不可能改过它，跳过不读
  const since = Date.parse(`${task.date}T00:00:00`) - 24 * 3600 * 1000;
  const dir = transcriptDir(root);
  const out = [];
  for (const f of safeReaddir(dir)) {
    const id = f.replace(/\.jsonl$/, '');
    if (id === f || !SESSION_RE.test(id)) continue;
    const file = path.join(dir, f);
    let st;
    try {
      st = fs.statSync(file);
    } catch {
      continue;
    }
    if (!want.has(id) && st.mtimeMs < since) continue;
    const i = info(file, st);
    const how = want.has(id) ? 'record' : i.touched.get(task.id);
    if (!how) continue;
    out.push({ id, how, start: i.start, end: new Date(st.mtimeMs).toISOString(), first: i.first, live: Date.now() - st.mtimeMs < LIVE_MS });
  }
  return out.sort((a, b) => String(a.start).localeCompare(String(b.start)));
}
