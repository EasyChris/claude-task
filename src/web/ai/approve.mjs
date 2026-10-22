// 确认草稿 = 直接上看板：没回答的问题按建议默认值记进正文，转成今天的 task 文件（status: queued、approved: true）
import fs from 'node:fs';
import { backlogFile } from '../backlog.mjs';
import { HttpError, writeAtomic } from '../fsutil.mjs';
import { startBacklog } from '../start.mjs';
import { loadChat, removeChat } from './chat.mjs';
import { isQueued, isRunning } from './drafts.mjs';

export function approveDraft(root, id) {
  if (isRunning(root, id)) throw new HttpError(409, '还在整理中，等它结束再确认');
  if (isQueued(root, id)) throw new HttpError(409, '还在排队等整理，先停止再确认');
  const file = backlogFile(root, id);
  const open = loadChat(root, id)?.questions || [];
  if (open.length) {
    const text = fs.readFileSync(file, 'utf8');
    const lines = open.map((q) => `- ${q.q} → 默认：${q.suggestion || '（未定，开工时再问）'}`);
    writeAtomic(file, `${text.trimEnd()}\n\n## 待确认（按建议默认处理）\n\n${lines.join('\n')}\n`);
  }
  const out = startBacklog(root, id, { approved: true });
  removeChat(root, id);
  return out;
}
