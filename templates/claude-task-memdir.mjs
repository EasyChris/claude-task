// claude-task：算出 Claude Code auto memory 的目录（由 npx claude-task 生成，update 会覆盖）。
// hook 和 CLI 共用这一份，规则改这里就行。规则来自官方文档 memory / sessions / managed-settings：
//   1. autoMemoryDirectory：managed > local > project > user，只认绝对路径或 `~/` 开头
//   2. CLAUDE_CODE_PROJECT_DIR_NAME（必须同时设了 CLAUDE_CONFIG_DIR）
//   3. <配置目录>/projects/<主仓库根的 slug>/memory（worktree、子目录共用一个）
// 读不到的来源：MDM / 注册表 / 服务器下发的 managed 设置、`claude --settings`；
// 项目路径的 slug 超过 200 字符时官方会截断再加哈希（算法未公开），这里不处理。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const WIN_DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function readJSONSafe(file) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

export function claudeConfigDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

// 文件形式的 managed 设置目录；CLAUDE_TASK_MANAGED_DIR 只给测试用
export function managedDir() {
  if (process.env.CLAUDE_TASK_MANAGED_DIR) return process.env.CLAUDE_TASK_MANAGED_DIR;
  if (process.platform === 'darwin') return '/Library/Application Support/ClaudeCode';
  if (process.platform === 'win32') return 'C:\\Program Files\\ClaudeCode';
  return '/etc/claude-code';
}

// managed-settings.json 先读，再按字母顺序读 managed-settings.d/*.json，后读的覆盖先读的
function managedValues(key) {
  const dir = managedDir();
  let drops = [];
  try {
    drops = fs.readdirSync(path.join(dir, 'managed-settings.d'))
      .filter((f) => f.endsWith('.json') && !f.startsWith('.')).sort()
      .map((f) => path.join(dir, 'managed-settings.d', f));
  } catch {}
  const values = [path.join(dir, 'managed-settings.json'), ...drops].map((f) => readJSONSafe(f)?.[key]);
  return values.reverse();
}

// 只认绝对路径或 `~/` 开头；其他值官方不用，返回 null 让下一层接着找
function memoryPath(v) {
  if (typeof v !== 'string' || !v.trim()) return null;
  const s = v.trim();
  if (s === '~' || /^~[\\/]/.test(s)) return path.join(os.homedir(), s.slice(1));
  return path.isAbsolute(s) ? path.normalize(s) : null;
}

// 与 Claude Code 一致：子目录、worktree 都归到主仓库根；不在 git 仓库里就用项目根
export function repoRoot(dir) {
  for (let d = dir; ; d = path.dirname(d)) {
    const git = path.join(d, '.git');
    try {
      if (fs.statSync(git).isDirectory()) return d;
      // worktree 的 .git 是文件：gitdir 指向 <主仓库>/.git/worktrees/<名字>，commondir 指回 <主仓库>/.git
      const gitdir = path.resolve(d, /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(git, 'utf8'))[1].trim());
      const common = fs.readFileSync(path.join(gitdir, 'commondir'), 'utf8').trim();
      return fs.realpathSync(path.dirname(path.resolve(gitdir, common)));
    } catch {
      if (fs.existsSync(git)) return d; // submodule 等没有 commondir 的情况，当成独立仓库
    }
    if (path.dirname(d) === d) return dir;
  }
}

export function resolveMemoryDir(root) {
  const configDir = claudeConfigDir();
  const candidates = [
    ...managedValues('autoMemoryDirectory'),
    readJSONSafe(path.join(root, '.claude', 'settings.local.json'))?.autoMemoryDirectory,
    readJSONSafe(path.join(root, '.claude', 'settings.json'))?.autoMemoryDirectory,
    readJSONSafe(path.join(configDir, 'settings.json'))?.autoMemoryDirectory,
  ];
  for (const v of candidates) {
    const p = memoryPath(v);
    if (p) return p;
  }
  const name = process.env.CLAUDE_CODE_PROJECT_DIR_NAME;
  if (process.env.CLAUDE_CONFIG_DIR && name && /^[A-Za-z0-9_-]{1,64}$/.test(name) && !WIN_DEVICE.test(name)) {
    return path.join(configDir, 'projects', name, 'memory');
  }
  return path.join(configDir, 'projects', repoRoot(root).replace(/[^a-zA-Z0-9]/g, '-'), 'memory');
}
