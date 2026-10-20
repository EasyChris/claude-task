import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter.mjs';
import { HttpError, readTextOr, safeReaddir } from './fsutil.mjs';
import { readIndexStatuses } from './indexfile.mjs';
import { inferStatus, isStale } from './status.mjs';

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
// task-01.md，也认 task-03-split-payment.md 这种带后缀的旧命名
export const TASK_FILE_RE = /^task-(\d+)(?:-[^/]*)?\.md$/;
const ID_RE = /^(\d{4}-\d{2}-\d{2})-(\d+)$/;
const CHECK_RE = /^(\s*)[-*+] \[([ xX])\] (.*)$/;
const FENCE_RE = /^\s*(`{3,}|~{3,})/;
const STATUS_LINE_RE = /^\s*[-*]?\s*\*\*状态\*\*\s*[:：]\s*(.+)$/m;

// 子任务：整个文件里的 `- [ ]` / `- [x]` 行，line 是文件行号（从 0 开始），代码块里的不算
export function parseSubtasks(text) {
  const out = [];
  let fence = null;
  text.split('\n').forEach((raw, line) => {
    const f = FENCE_RE.exec(raw);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      return;
    }
    if (fence) return;
    const m = CHECK_RE.exec(raw.replace(/\r$/, ''));
    if (m) out.push({ line, done: m[2] !== ' ', text: m[3].trim(), depth: Math.floor(m[1].length / 2) });
  });
  return out;
}

function titleOf(fm, body, num) {
  if (fm?.title) return fm.title;
  const h = /^#\s+(.+)$/m.exec(body);
  return h ? h[1].replace(/^任务\s*\d+\s*[:：]\s*/, '').trim() : `task-${num}`;
}

export function parseTask(text, { date, num, indexText = '' }) {
  const { data: fm, body } = parseFrontmatter(text);
  const subtasks = parseSubtasks(text);
  const statusLine = STATUS_LINE_RE.exec(body)?.[1]?.trim() || '';
  const { status, inferred } = inferStatus({ fm, subtasks, indexText, statusLine });
  return {
    id: `${date}-${num}`,
    date,
    num,
    title: titleOf(fm, body, num),
    status,
    inferred,
    progress: { done: subtasks.filter((s) => s.done).length, total: subtasks.length },
    note: indexText || statusLine,
    completed: fm?.completed || null,
  };
}

// 同一天同号的文件优先用标准命名 task-NN.md
export function taskFile(root, date, num) {
  const dir = path.join(root, 'docs', 'tasks', date);
  const std = `task-${num}.md`;
  if (fs.existsSync(path.join(dir, std))) return path.join(dir, std);
  const alt = safeReaddir(dir).find((f) => TASK_FILE_RE.exec(f)?.[1] === num);
  return path.join(dir, alt || std);
}

export function resolveTask(root, id) {
  const m = ID_RE.exec(String(id || ''));
  if (!m) throw new HttpError(400, '任务 id 格式不对');
  const file = taskFile(root, m[1], m[2]);
  if (!fs.existsSync(file)) throw new HttpError(404, '任务文件不存在');
  return { file, date: m[1], num: m[2] };
}

export const readDayIndex = (dayDir) => readIndexStatuses(readTextOr(path.join(dayDir, 'index.md'), ''));

// 按 mtime + 大小 + 索引行缓存解析结果，几百个文件每次刷新也只 stat 一遍
const cache = new Map();

export function loadTask(root, date, num, indexText = '') {
  const file = taskFile(root, date, num);
  const st = fs.statSync(file);
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size && hit.indexText === indexText) return hit;
  const text = fs.readFileSync(file, 'utf8');
  const entry = { mtimeMs: st.mtimeMs, size: st.size, indexText, text, task: { ...parseTask(text, { date, num, indexText }), updated: st.mtimeMs } };
  cache.set(file, entry);
  return entry;
}

export function loadTasks(root) {
  const base = path.join(root, 'docs', 'tasks');
  const out = [];
  for (const date of safeReaddir(base).filter((d) => DAY_RE.test(d))) {
    const index = readDayIndex(path.join(base, date));
    const nums = new Set();
    for (const f of safeReaddir(path.join(base, date))) {
      const m = TASK_FILE_RE.exec(f);
      if (!m || nums.has(m[1])) continue;
      nums.add(m[1]);
      try {
        out.push(loadTask(root, date, m[1], index.get(m[1]) || ''));
      } catch {}
    }
  }
  return out.sort((a, b) => b.task.date.localeCompare(a.task.date) || Number(b.task.num) - Number(a.task.num));
}

function snippet(text, i, len) {
  const s = Math.max(0, i - 30);
  return (s > 0 ? '…' : '') + text.slice(s, i + len + 50).replace(/\s+/g, ' ').trim() + '…';
}

export function listTasks(root, q) {
  const now = new Date();
  const entries = loadTasks(root);
  const needle = String(q || '').trim().toLowerCase();
  const items = !needle ? entries.map((e) => e.task) : entries.flatMap((e) => {
    // 标题命中就不再显示摘要；只有正文命中才显示命中的那一段
    if (e.task.title.toLowerCase().includes(needle)) return [{ ...e.task, snippet: '' }];
    const i = e.text.toLowerCase().indexOf(needle);
    return i < 0 ? [] : [{ ...e.task, snippet: snippet(e.text, i, needle.length) }];
  });
  return items.map((t) => ({ ...t, stale: isStale(t, now) }));
}
