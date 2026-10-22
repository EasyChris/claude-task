import fs from 'node:fs';
import path from 'node:path';
import { mergeHooks, HOOK_SCRIPT, MEMDIR_SCRIPT, NEXT_COMMAND, QUEUE_SCRIPT } from './settings.mjs';
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
    memoryDir: memoryDirDisplay(root),
    ...extra,
  };
}

// 受管文件：init 和 update 都会刷新（配置、hook 脚本、/next 命令、settings 里的 hooks、记录规范）
export function writeManaged(root, cfg, w) {
  const settingsFile = path.join(root, '.claude', 'settings.json');
  const settings = readJSON(settingsFile); // 先读，坏 JSON 在写任何文件之前就报错

  w.write(path.join(root, CONFIG_FILE), JSON.stringify(cfg, null, 2) + '\n', { overwrite: true });

  // /next 靠 hook 脚本的 queue 子命令拿队列，所以有意和 hook 绑在一起：--no-hooks 时不装、已装的删掉
  const files = [
    [HOOK_SCRIPT, 'hook.mjs'],
    [MEMDIR_SCRIPT, 'claude-task-memdir.mjs'],
    [QUEUE_SCRIPT, 'claude-task-queue.mjs'],
    [NEXT_COMMAND, 'next.md', true],
  ];
  for (const [file, tpl, vars] of files) {
    const text = vars ? render(readTemplate(tpl), templateVars(root, cfg)) : readTemplate(tpl);
    if (cfg.hooks) w.write(path.join(root, file), text, { overwrite: true });
    else w.remove(path.join(root, file));
  }
  if (settings || cfg.hooks) {
    w.write(settingsFile, JSON.stringify(mergeHooks(settings, cfg.hooks), null, 2) + '\n', { overwrite: true });
  }

  const readme = path.join(root, 'docs', 'task-history', 'README.md');
  const managed = fs.existsSync(readme) && fs.readFileSync(readme, 'utf8').includes(MANAGED);
  w.write(readme, render(readTemplate('task-history-README.md'), templateVars(root, cfg)), { overwrite: managed });
}

// 骨架：只建不改（当月/今日索引、记忆目录）
export function writeSkeleton(root, cfg, w) {
  const { day, month } = localDate();
  w.write(path.join(root, 'docs', 'task-history', month, 'index.md'), render(readTemplate('month-index.md'), { month }));
  w.write(path.join(root, 'docs', 'tasks', day, 'index.md'), `# ${day} 任务索引\n\n`);

  const mem = memoryDir(root);
  w.mkdir(path.join(mem, 'sessions'));
  const indexFile = path.join(mem, 'MEMORY.md');
  const old = fs.existsSync(indexFile) ? fs.readFileSync(indexFile, 'utf8') : null;
  if (old === null) w.write(indexFile, SESSIONS_POINTER);
  else if (!old.includes('](sessions/')) {
    w.write(indexFile, (old.trim() ? old.trimEnd() + '\n' : '') + SESSIONS_POINTER, { overwrite: true });
  }
}
