// 执行队列：task frontmatter 的 run_order（正整数）。看板拖动后把整列顺序一次发过来，这里重排成 1..n
// 写法和 edit.mjs 一样：每个文件读最新 → 只改 run_order（必要时改 status）→ 原子写回，正文和其他字段不动
import fs from 'node:fs';
import { QUEUE_STATUSES } from '../../templates/claude-task-queue.mjs';
import { removeFrontmatter, setFrontmatter } from './frontmatter.mjs';
import { setStatus } from './edit.mjs';
import { HttpError, writeAtomic } from './fsutil.mjs';
import { listTasks, loadTasks, resolveTask } from './tasks.mjs';

function writeRunOrder(root, id, order) {
  const { file } = resolveTask(root, id);
  const src = fs.readFileSync(file, 'utf8');
  const next = order ? setFrontmatter(src, { run_order: order }) : removeFrontmatter(src, ['run_order']);
  if (next !== src) writeAtomic(file, next);
}

// ids：执行队列从上到下的 task id。列表里的排成 1..n，不在列表里的去掉 run_order
// 进行中 / 已完成 / 暂存 / 取消 / 推断出来的旧任务被拖进来时先改成 queued，否则不会出现在队列里
export function setQueue(root, ids) {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) throw new HttpError(400, 'ids 应该是 task id 列表');
  if (new Set(ids).size !== ids.length) throw new HttpError(400, 'ids 里有重复的任务');
  ids.forEach((id) => resolveTask(root, id)); // 先全部校验，有一个不存在就什么都不写

  const byId = new Map(loadTasks(root).map((e) => [e.task.id, e.task]));
  ids.forEach((id, i) => {
    const t = byId.get(id);
    if (!t || t.inferred || !QUEUE_STATUSES.includes(t.status)) setStatus(root, id, { status: 'queued' });
    writeRunOrder(root, id, i + 1);
  });
  const keep = new Set(ids);
  for (const t of byId.values()) {
    if (t.runOrder && !keep.has(t.id)) writeRunOrder(root, t.id, null);
  }
  return listTasks(root);
}
