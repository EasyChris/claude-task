// claude-task 的执行队列（由 npx claude-task 生成，update 会覆盖）。
// 读 docs/tasks 下所有日期目录的 task frontmatter：进行中的任务 + 排在执行队列里的任务（按 run_order）。
// hook 的 queue 子命令（/next 用）和 session-start 提示用它；CLI / Web 也 import 这里的判断规则，保证几边一致。
import fs from 'node:fs';
import path from 'node:path';

// 有 run_order 且状态是这几个的才算在执行队列里（和看板「待开始」列同一组状态）
export const QUEUE_STATUSES = ['queued', 'planning', 'awaiting_approval'];
// 改成这些状态 = 离开执行队列，run_order 要删掉（开工、做完、暂存、取消）
export const NOT_QUEUED = ['in_progress', 'done', 'paused', 'cancelled'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TASK_RE = /^task-(\d+)(?:-[^/]*)?\.md$/;
const FM = /^---\r?\n([\s\S]*?)\r?\n---/;

// 只认正整数；写错了（0、小数、文字）就当没排进队列
export function parseRunOrder(v) {
  const s = String(v ?? '').trim();
  return /^\d+$/.test(s) && Number(s) > 0 ? Number(s) : null;
}

export const inQueue = ({ status, runOrder }) => Boolean(runOrder) && QUEUE_STATUSES.includes(status);

function unquote(v) {
  if (v.startsWith('"')) {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v.length > 1 && v.startsWith("'") && v.endsWith("'") ? v.slice(1, -1).replace(/''/g, "'") : v;
}

function readFrontmatter(file) {
  try {
    const m = FM.exec(fs.readFileSync(file, 'utf8'));
    if (!m) return null;
    const data = {};
    for (const line of m[1].split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i > 0 && !/^\s/.test(line)) data[line.slice(0, i).trim()] = unquote(line.slice(i + 1).trim());
    }
    return data;
  } catch {
    return null;
  }
}

const list = (dir) => {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
};

// 没有 frontmatter 的旧 task 文件状态靠推断，不算进来（Web 上拖一下就会补上 frontmatter）
export function readQueue(root) {
  const base = path.join(root, 'docs', 'tasks');
  const tasks = [];
  for (const day of list(base).filter((d) => DAY_RE.test(d))) {
    const seen = new Set();
    for (const f of list(path.join(base, day)).sort()) {
      const m = TASK_RE.exec(f);
      if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);
      const fm = readFrontmatter(path.join(base, day, f));
      if (!fm?.status) continue;
      tasks.push({
        id: fm.id || `${day}-${m[1]}`,
        title: fm.title || f,
        status: fm.status,
        runOrder: parseRunOrder(fm.run_order),
        approved: String(fm.approved) === 'true',
        file: `docs/tasks/${day}/${f}`,
      });
    }
  }
  return {
    active: tasks.filter((t) => t.status === 'in_progress'),
    queue: tasks.filter(inQueue).sort((a, b) => a.runOrder - b.runOrder || a.id.localeCompare(b.id)),
  };
}

// queue 子命令的输出：/next 用 !`…` 注入提示词
export function formatQueue({ active, queue }) {
  const out = ['[claude-task] 执行队列（docs/tasks 下所有日期，按 run_order 从小到大）', '', `## 进行中（${active.length} 条）`];
  if (!active.length) out.push('（没有）');
  for (const t of active) out.push(`- ${t.id}《${t.title}》 ${t.file}`);
  out.push('', `## 执行队列（${queue.length} 条）`);
  if (!queue.length) out.push('（空）');
  queue.forEach((t, i) => {
    out.push(`${i + 1}. ${t.id}《${t.title}》 · run_order: ${t.runOrder} · ${t.approved ? 'approved: true（计划已确认）' : '未 approved（开工前先说计划等确认）'} · ${t.file}`);
  });
  return out.join('\n') + '\n';
}

// session-start 里的一两句提示；都没有就返回空数组
export function queueHint({ active, queue }) {
  const out = [];
  if (active.length) {
    out.push(`有 ${active.length} 条任务在进行中：${active.slice(0, 3).map((t) => `《${t.title}》（${t.id}）`).join('、')}${active.length > 3 ? ' 等' : ''}。`);
  }
  if (queue.length) out.push(`执行队列有 ${queue.length} 条，第 1 条是《${queue[0].title}》，输入 /next 开始。`);
  return out;
}
