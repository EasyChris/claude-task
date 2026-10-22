// 草稿的对话记录：一个草稿一份 JSON，放 ~/.claude-task/chats，不进仓库
import fs from 'node:fs';
import path from 'node:path';
import { claudeTaskHome, projectSlug } from '../../util.mjs';
import { writeAtomic } from '../fsutil.mjs';

const chatFile = (root, id) => path.join(claudeTaskHome(), 'chats', projectSlug(root), `${id}.json`);

export function loadChat(root, id) {
  try {
    return JSON.parse(fs.readFileSync(chatFile(root, id), 'utf8'));
  } catch {
    return null;
  }
}

export const saveChat = (root, id, chat) => writeAtomic(chatFile(root, id), JSON.stringify(chat, null, 2) + '\n');
export const removeChat = (root, id) => fs.rmSync(chatFile(root, id), { force: true });

export function userName(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, '.claude', 'claude-task.json'), 'utf8')).name || '用户';
  } catch {
    return '用户';
  }
}
