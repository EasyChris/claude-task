// 规划条目转成今天的 task-NN.md：图片搬进当天 assets/，更新当日索引，再删掉规划文件
// 草稿确认、旧数据迁移都走这里；approved 的转成 status: queued + approved: true，出现在看板「待开始」列
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

// approved 不传就看规划文件自己的 approved 字段
export function startBacklog(root, id, { approved } = {}) {
  const file = backlogFile(root, id);
  const item = getBacklog(root, id);
  const ok = approved ?? item.approved;
  const { day } = localDate();
  const dayDir = path.join(root, 'docs', 'tasks', day);
  const nums = safeReaddir(dayDir).map((f) => Number(TASK_FILE_RE.exec(f)?.[1] || 0));
  const num = pad2(Math.max(0, ...nums) + 1);
  const body = moveImages(root, item, dayDir, num, item.body);

  // AI 整理过的规划已经分好「## 需求分析 / ## 子任务」，直接用；手写的短规划套一层模板
  const main = /^##\s/m.test(body) ? [body.trim()] : ['## 需求分析', '', body.trim() || '（待补充）', '', '## 子任务'];
  const status = ok ? 'queued' : 'planning';
  const text = [
    `# 任务 ${Number(num)}: ${item.title}`,
    '',
    ...main,
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
    status,
    approved: ok ? 'true' : undefined,
    priority: item.priority,
    created: nowStamp(),
    from: `backlog/${id}.md`,
  }));
  syncIndexes(root, { date: day, num, title: item.title, status });
  fs.unlinkSync(file);
  return { id: taskId };
}
