// 旧数据迁移：规划页不再有「待执行队列」。已确认（approved）的直接转成 task 文件上看板，没确认的退回草稿
// 列出规划和服务启动时各跑一次；跑过之后 docs/backlog 里只剩草稿，再跑什么都不做
import fs from 'node:fs';
import path from 'node:path';
import { backlogDir, listBacklog } from './backlog.mjs';
import { setFrontmatter } from './frontmatter.mjs';
import { writeAtomic } from './fsutil.mjs';
import { startBacklog } from './start.mjs';

export function migrateBacklog(root) {
  const out = { started: [], drafted: [] };
  for (const item of listBacklog(root).filter((i) => i.status !== 'draft')) {
    if (item.approved) {
      out.started.push(startBacklog(root, item.id, { approved: true }).id);
    } else {
      const file = path.join(backlogDir(root), `${item.id}.md`);
      writeAtomic(file, setFrontmatter(fs.readFileSync(file, 'utf8'), { status: 'draft' }));
      out.drafted.push(item.id);
    }
  }
  return out;
}
