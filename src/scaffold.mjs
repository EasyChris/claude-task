import fs from 'node:fs';
import path from 'node:path';
import { mergeHooks, HOOK_SCRIPT } from './settings.mjs';
import { MANAGED, localDate, memoryDir, memoryDirDisplay, pkgVersion, readJSON, readTemplate, render } from './util.mjs';

export const CONFIG_FILE = path.join('.claude', 'claude-task.json');
const SESSIONS_POINTER = '- [会话记录](sessions/) — 每次会话一份，按 YYYY-MM-DD-NN 编号，看最新的那份\n';

export function readConfig(root) {
  return readJSON(path.join(root, CONFIG_FILE));
}

export function templateVars(root, cfg, extra = {}) {
  return {
    version: pkgVersion(),
    name: cfg.name || '用户',
    hooks: cfg.hooks,
    reminder: cfg.reminderMinutes,
    memoryDir: memoryDirDisplay(root, cfg.memory),
    ...extra,
  };
}

// 受管文件：init 和 update 都会刷新（配置、hook 脚本、settings 里的 hooks、记录规范）
export function writeManaged(root, cfg, w) {
  const settingsFile = path.join(root, '.claude', 'settings.json');
  const settings = readJSON(settingsFile); // 先读，坏 JSON 在写任何文件之前就报错

  w.write(path.join(root, CONFIG_FILE), JSON.stringify(cfg, null, 2) + '\n', { overwrite: true });

  const hookFile = path.join(root, HOOK_SCRIPT);
  if (cfg.hooks) w.write(hookFile, readTemplate('hook.mjs'), { overwrite: true });
  else w.remove(hookFile);
  if (settings || cfg.hooks) {
    w.write(settingsFile, JSON.stringify(mergeHooks(settings, cfg.hooks), null, 2) + '\n', { overwrite: true });
  }

  const readme = path.join(root, 'docs', 'task-history', 'README.md');
  const managed = fs.existsSync(readme) && fs.readFileSync(readme, 'utf8').includes(MANAGED);
  w.write(readme, render(readTemplate('task-history-README.md'), templateVars(root, cfg)), { overwrite: managed });

  if (cfg.memory === 'repo') ensureGitignore(root, '.ai/memory/sessions/', w);
}

// 骨架：只建不改（当月/今日索引、记忆目录）
export function writeSkeleton(root, cfg, w) {
  const { day, month } = localDate();
  w.write(path.join(root, 'docs', 'task-history', month, 'index.md'), render(readTemplate('month-index.md'), { month }));
  w.write(path.join(root, 'docs', 'tasks', day, 'index.md'), `# ${day} 任务索引\n\n`);

  const mem = memoryDir(root, cfg.memory);
  w.mkdir(path.join(mem, 'sessions'));
  const indexFile = path.join(mem, 'MEMORY.md');
  const old = fs.existsSync(indexFile) ? fs.readFileSync(indexFile, 'utf8') : null;
  if (old === null) w.write(indexFile, SESSIONS_POINTER);
  else if (!old.includes('](sessions/')) {
    w.write(indexFile, (old.trim() ? old.trimEnd() + '\n' : '') + SESSIONS_POINTER, { overwrite: true });
  }
}

function ensureGitignore(root, line, w) {
  const file = path.join(root, '.gitignore');
  const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (old.split('\n').some((l) => l.trim() === line)) return;
  w.write(file, (old.trim() ? old.trimEnd() + '\n' : '') + line + '\n', { overwrite: true });
}
