// 规划里点「开始」：转成今天的 task-NN.md（status: planning），图片搬进当天 assets/，再删掉规划文件
import fs from 'node:fs';
import path from 'node:path';
import { backlogDir, backlogFile, getBacklog } from './backlog.mjs';
import { setFrontmatter } from './frontmatter.mjs';
import { escapeRe, nowStamp, pad2, safeReaddir, writeAtomic } from './fsutil.mjs';
import { syncIndexes } from './sync.mjs';
import { TASK_FILE_RE } from './tasks.mjs';
import { localDate } from '../util.mjs';

function moveImages(root, item, dayDir, num, body) {
  const src = path.join(backlogDir(root), 'assets');
  const prefix = `bl-${item.num}-`;
  let k = 0;
  for (const f of safeReaddir(src).filter((x) => x.startsWith(prefix)).sort()) {
    const name = `task-${num}-${++k}${path.extname(f)}`;
    fs.mkdirSync(path.join(dayDir, 'assets'), { recursive: true });
    fs.renameSync(path.join(src, f), path.join(dayDir, 'assets', name));
    body = body.replace(new RegExp(`assets/${escapeRe(f)}`, 'g'), `assets/${name}`);
  }
  return body;
}

export function startBacklog(root, id) {
  const file = backlogFile(root, id);
  const item = getBacklog(root, id);
  const { day } = localDate();
  const dayDir = path.join(root, 'docs', 'tasks', day);
  const nums = safeReaddir(dayDir).map((f) => Number(TASK_FILE_RE.exec(f)?.[1] || 0));
  const num = pad2(Math.max(0, ...nums) + 1);
  const body = moveImages(root, item, dayDir, num, item.body);

  const text = [
    `# 任务 ${Number(num)}: ${item.title}`,
    '',
    '## 需求分析',
    '',
    body.trim() || '（待补充）',
    '',
    '## 子任务',
    '',
    '## 总结',
    '',
    '## 踩坑记录',
    '',
    '## 后续 session 注意',
    '',
  ].join('\n');
  const taskId = `${day}-${num}`;
  writeAtomic(path.join(dayDir, `task-${num}.md`), setFrontmatter(text, {
    id: taskId,
    title: item.title,
    status: 'planning',
    priority: item.priority,
    created: nowStamp(),
    from: `backlog/${id}.md`,
  }));
  syncIndexes(root, { date: day, num, title: item.title, status: 'planning' });
  fs.unlinkSync(file);
  return { id: taskId };
}
