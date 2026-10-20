// 任务状态变了，同步改当日 index.md 和月度索引里那一行
import fs from 'node:fs';
import path from 'node:path';
import { escapeRe, readTextOr, writeAtomic } from './fsutil.mjs';
import { updateIndex } from './indexfile.mjs';
import { LABEL } from './status.mjs';
import { readTemplate, render } from '../util.mjs';

const cell = (s) => String(s).replace(/\|/g, '｜');

export function syncIndexes(root, { date, num, title, status, fileName = `task-${num}.md` }) {
  const label = LABEL[status];

  const dayFile = path.join(root, 'docs', 'tasks', date, 'index.md');
  const day = readTextOr(dayFile, `# ${date} 任务索引\n\n`);
  const nextDay = updateIndex(day, {
    re: new RegExp(`task-${num}(?:-[\\w.-]*)?\\.md`),
    status,
    values: { 序号: Number(num), 任务: cell(title), 状态: label, 文件: `[${fileName}](${fileName})` },
    listLine: `- [task-${num}](${fileName}) ${title} — ${label}`,
  });
  if (nextDay !== day) writeAtomic(dayFile, nextDay);

  // 月度索引只在项目已经用 docs/task-history 时才动；旧项目不新建这套目录
  const historyDir = path.join(root, 'docs', 'task-history');
  if (!fs.existsSync(historyDir)) return;
  const month = date.slice(0, 7);
  const monthFile = path.join(historyDir, month, 'index.md');
  const exists = fs.existsSync(monthFile);
  if (!exists && status !== 'done') return;
  const text = exists ? fs.readFileSync(monthFile, 'utf8') : render(readTemplate('month-index.md'), { month });
  const next = updateIndex(text, {
    re: new RegExp(`tasks/${escapeRe(date)}/task-${num}(?:-[\\w.-]*)?\\.md`),
    status,
    values: status === 'done' ? {
      日期: date.slice(5),
      任务: cell(title),
      状态: label,
      文件: `[task-${num}](../../tasks/${date}/${fileName})`,
    } : undefined,
  });
  if (next !== text) writeAtomic(monthFile, next);
}
