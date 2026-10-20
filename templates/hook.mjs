#!/usr/bin/env node
// claude-task 的 Claude Code hook（由 npx claude-task 生成，update 会覆盖）。
// session-start：建好今日目录，把记忆索引、最近会话记录、今日任务索引注入上下文。
// user-prompt-submit：每隔 reminderMinutes 分钟提醒一次写会话记录。
// 任何异常都静默结束，不能卡住 Claude Code。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAX = { memory: 4000, session: 3000, today: 1500 };
const STATE_DIR = process.env.CLAUDE_TASK_STATE_DIR || path.join(os.tmpdir(), 'claude-task-state');

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function readText(file, max) {
  try {
    const t = fs.readFileSync(file, 'utf8').trim();
    return t.length > max ? `${t.slice(0, max)}\n…（已截断，完整内容见 ${file}）` : t;
  } catch {
    return null;
  }
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function memoryDir(root, cfg) {
  if (cfg.memory === 'repo') return path.join(root, '.ai', 'memory');
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(base, 'projects', root.replace(/[^a-zA-Z0-9]/g, '-'), 'memory');
}

function latestSession(dir) {
  try {
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t || b.f.localeCompare(a.f))[0]?.f || null;
  } catch {
    return null;
  }
}

function stateFile(sessionId) {
  return path.join(STATE_DIR, `${String(sessionId || 'default').replace(/[^\w-]/g, '_')}.json`);
}

function readState(sessionId) {
  try {
    return JSON.parse(fs.readFileSync(stateFile(sessionId), 'utf8'));
  } catch {
    return null;
  }
}

function writeState(sessionId, state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(stateFile(sessionId), JSON.stringify(state));
}

function sessionStart(input, root, cfg) {
  const day = today();
  const dayDir = path.join(root, 'docs', 'tasks', day);
  const dayIndex = path.join(dayDir, 'index.md');
  if (!fs.existsSync(dayIndex)) {
    fs.mkdirSync(dayDir, { recursive: true });
    fs.writeFileSync(dayIndex, `# ${day} 任务索引\n\n`);
  }

  const mem = memoryDir(root, cfg);
  const out = [`[claude-task] 今天是 ${day}。按 CLAUDE.md「会话开始流程」向 ${cfg.name || '用户'} 汇报，下面的内容已替你读好。`];
  out.push(`\n## 记忆索引 ${path.join(mem, 'MEMORY.md')}\n${readText(path.join(mem, 'MEMORY.md'), MAX.memory) || '（空）'}`);
  const last = latestSession(path.join(mem, 'sessions'));
  out.push(last
    ? `\n## 最近一份会话记录 sessions/${last}\n${readText(path.join(mem, 'sessions', last), MAX.session)}`
    : '\n## 最近一份会话记录\n（还没有）');
  out.push(`\n## 今日任务索引 docs/tasks/${day}/index.md\n${readText(dayIndex, MAX.today) || '（空）'}`);
  if (input.source === 'compact') {
    out.push('\n[claude-task] 上下文刚被压缩：先根据摘要把本次会话进展写进/更新会话记录，再继续。');
  }

  const prev = readState(input.session_id);
  if (!(input.source === 'resume' && prev)) writeState(input.session_id, { last: Date.now() });
  process.stdout.write(out.join('\n') + '\n');
}

function userPromptSubmit(input, cfg) {
  const now = Date.now();
  const state = readState(input.session_id);
  // 会话中途才装上 hook：从现在开始计时，这次不提醒
  if (!state) return writeState(input.session_id, { last: now });
  const minutes = Math.floor((now - state.last) / 60000);
  if (minutes < (cfg.reminderMinutes || 30)) return;
  writeState(input.session_id, { ...state, last: now });
  process.stdout.write(
    `[claude-task] 距上次提醒已过 ${minutes} 分钟：处理完这条消息后，把本次会话进展写进/更新记忆目录下的 `
    + 'sessions/YYYY-MM-DD-NN.md（同一会话更新原文件，不新建）。\n',
  );
}

try {
  const input = readStdin();
  // 和 CLI 一样先解析软链接（macOS 的 /var → /private/var），否则两边算出的记忆目录对不上
  let root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  try {
    root = fs.realpathSync(root);
  } catch {}
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'claude-task.json'), 'utf8'));
  } catch {}
  const mode = process.argv[2];
  if (mode === 'session-start') sessionStart(input, root, cfg);
  else if (mode === 'user-prompt-submit') userPromptSubmit(input, cfg);
} catch {}
