// 任务状态：frontmatter 里的取值、写回索引时用的文字、从旧记录文字里推断
export const STATUSES = ['queued', 'planning', 'awaiting_approval', 'in_progress', 'done', 'paused', 'cancelled'];

export const LABEL = {
  queued: '📋 排队中',
  planning: '📝 规划中',
  awaiting_approval: '⏳ 待确认',
  in_progress: '🚧 进行中',
  done: '✅ 已完成',
  paused: '⏸ 暂存',
  cancelled: '❌ 已取消',
};

// 顺序有讲究：「未完成」要先于「完成」，「✅ 已上线（待确认）」要先判成 done
const RULES = [
  [/⏸|暂存|暂停|搁置/, 'paused'],
  [/❌|↩️|已取消|取消|放弃|回滚/, 'cancelled'],
  [/🚧|进行中|未完成|开发中/, 'in_progress'],
  [/规划中/, 'planning'],
  [/📋|排队|未开始/, 'queued'],
  [/✅|🚀|📄|已完成|已上线|已部署|已交付|完成/, 'done'],
  [/⏳|待确认/, 'awaiting_approval'],
];

export function statusFromText(text) {
  if (!text) return null;
  for (const [re, status] of RULES) if (re.test(text)) return status;
  return null;
}

// 没有 frontmatter 的旧文件：勾选框优先（状态行常年不改，不可信），其次索引/状态行的标记
export function inferStatus({ fm, subtasks, indexText, statusLine }) {
  if (fm && STATUSES.includes(fm.status)) return { status: fm.status, inferred: false };
  const open = subtasks.some((s) => !s.done);
  if (subtasks.length && !open) return { status: 'done', inferred: true };
  const marked = statusFromText(indexText) ?? statusFromText(statusLine);
  if (subtasks.length) return { status: marked ?? 'in_progress', inferred: true };
  return { status: marked ?? 'unknown', inferred: true };
}

const DAY_MS = 86400000;

// 推断为「进行中」但已经两周没动的旧任务：多半早做完了，只是没勾，看板上折叠起来
export function isStale(task, now = new Date()) {
  if (!task.inferred || task.status !== 'in_progress') return false;
  return now.getTime() - new Date(`${task.date}T00:00:00`).getTime() > 14 * DAY_MS;
}
