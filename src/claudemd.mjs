import fs from 'node:fs';
import path from 'node:path';
import { BLOCK_END, BLOCK_START, UserError, readTemplate, render } from './util.mjs';

export const PLACEHOLDER_INTRO = '<!-- 一两句话说明这个项目做什么 -->';
export const PLACEHOLDER_FEATURES = '<!-- 列出主要模块/功能，一行一个 -->';

export function findBlock(text) {
  const start = text.indexOf(BLOCK_START);
  if (start < 0) return null;
  const end = text.indexOf(BLOCK_END, start);
  if (end < 0) throw new UserError('CLAUDE.md 里有 claude-task:start 但找不到 claude-task:end，请先手动补上或删掉起始标记');
  return { start, end: end + BLOCK_END.length };
}

// 有标记块就整块替换，没有就追加到末尾；块外内容原样保留
export function upsertBlock(text, block) {
  const b = findBlock(text);
  if (b) return text.slice(0, b.start) + block + text.slice(b.end);
  return text.trimEnd() + '\n\n' + block + '\n';
}

// 旧版工作流：有「会话开始流程」但还没接入 claude-task，需要走 migrate
export function isLegacyWorkflow(text) {
  return !findBlock(text) && /会话开始流程/.test(text);
}

// 项目接入情况（CLI 和 Web 共用）：已接入 / 拆分版（有 docs/task-history 的旧流程）/ 旧版 / 未接入
// 拆分版和旧版都需要 migrate
export function projectKind(root) {
  let md = '';
  try {
    md = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
  } catch {}
  if (md.includes(BLOCK_START)) return 'claude-task';
  if (!isLegacyWorkflow(md)) return 'none';
  return fs.existsSync(path.join(root, 'docs', 'task-history')) ? 'split' : 'legacy';
}

export const needsMigrate = (kind) => kind === 'split' || kind === 'legacy';

// "a, b；c" 或多行 → markdown 列表
export function formatFeatures(features) {
  const items = String(features || '').split(/[,，;；\n]/).map((s) => s.trim()).filter(Boolean);
  return items.map((s) => (s.startsWith('- ') ? s : `- ${s}`)).join('\n');
}

export function renderBlock(vars) {
  return render(readTemplate('claude-block.md'), vars).trim();
}

export function renderNewClaudeMd(vars) {
  return render(readTemplate('claude-new.md'), { ...vars, block: renderBlock(vars) });
}
