#!/usr/bin/env node
// claude-task 的 Claude Code hook（由 npx claude-task 生成，update 会覆盖）。
// session-start：建好今日目录，把最近会话记录、今日任务索引注入上下文。
//   MEMORY.md 由 Claude Code 的 auto memory 自己加载（前 200 行或 25KB），这里不重复注入。
// user-prompt-submit：每隔 reminderMinutes 分钟提醒一次写会话记录。
// queue：打印进行中的任务和执行队列（/next 命令用 !`…` 注入），读法在同目录的 claude-task-queue.mjs。
// 任何异常都静默结束，不能卡住 Claude Code。
// 记忆目录的算法在同目录的 claude-task-memdir.mjs，CLI 也用它，保证两边算出同一个目录。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveMemoryDir } from './claude-task-memdir.mjs';
import { formatQueue, queueHint, readQueue } from './claude-task-queue.mjs';

const MAX = { session: 3000, today: 1500 };
const STATE_DIR = process.env.CLAUDE_TASK_STATE_DIR || path.join(os.tmpdir(), 'claude-task-state');

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function readJSONSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
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

// 文件名是 YYYY-MM-DD-NN，按名字排就是时间顺序；改过的旧记录不会被当成最新
function latestSession(dir) {
  try {
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))[0] || null;
  } catch {
    return null;
  }
}

// 太长时保留开头（标题、时间、关联任务）和「待办事项」，开场汇报最需要这两块
function readSession(file) {
  const t = readText(file, Infinity);
  if (!t || t.length <= MAX.session) return t;
  const parts = t.split(/\n(?=## )/);
  const todo = parts.filter((p) => p.startsWith('## 待办')).join('\n\n');
  return [parts[0].slice(0, 800), `…（中间已省略，完整内容见 ${file}）`, todo.slice(0, MAX.session)]
    .filter(Boolean).join('\n\n');
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function stateFile(sessionId) {
  return path.join(STATE_DIR, `${String(sessionId || 'default').replace(/[^\w-]/g, '_')}.json`);
}

function readState(sessionId) {
  return readJSONSafe(stateFile(sessionId));
}

function writeState(sessionId, state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(stateFile(sessionId), JSON.stringify(state));
}

// 规划里的草稿数（docs/backlog/*.md 里 status: draft 的）；确认后会直接转成 task 文件，这里只提醒一句
function draftCount(root) {
  const dir = path.join(root, 'docs', 'backlog');
  try {
    return fs.readdirSync(dir)
      .filter((f) => /^\d+-.*\.md$/.test(f) && /^status:\s*draft\s*$/m.test(readText(path.join(dir, f), 2000) || '')).length;
  } catch {
    return 0;
  }
}

function sessionStart(input, root, cfg) {
  const day = today();
  const dayDir = path.join(root, 'docs', 'tasks', day);
  const dayIndex = path.join(dayDir, 'index.md');
  if (!fs.existsSync(dayIndex)) {
    fs.mkdirSync(dayDir, { recursive: true });
    fs.writeFileSync(dayIndex, `# ${day} 任务索引\n\n`);
  }

  const mem = resolveMemoryDir(root);
  const out = [
    `[claude-task] 今天是 ${day}。按 CLAUDE.md「会话开始流程」向 ${cfg.name || '用户'} 汇报，下面的内容已替你读好。`,
    `记忆目录：${mem}（MEMORY.md 由 Claude Code 自动加载，这里不重复）`,
  ];
  if (input.session_id) {
    out.push(`本次会话 id：${input.session_id}。新建或接着做某个 task 时，把它追加到该 task frontmatter 的 sessions 字段（逗号分隔，已有就不重复）；Web 看板靠它显示这个任务的完整对话。`);
  }
  const last = latestSession(path.join(mem, 'sessions'));
  out.push(last
    ? `\n## 最近一份会话记录 sessions/${last}\n${readSession(path.join(mem, 'sessions', last))}`
    : '\n## 最近一份会话记录\n（还没有）');
  out.push(`\n## 今日任务索引 docs/tasks/${day}/index.md\n${readText(dayIndex, MAX.today) || '（空）'}`);
  const drafts = draftCount(root);
  if (drafts) out.push(`\n规划里有 ${drafts} 条草稿待确认（在 npx claude-task web 的规划页确认后会直接出现在看板上）。`);
  const hint = queueHint(readQueue(root));
  if (hint.length) out.push(`\n${hint.join('\n')}`);
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

function main() {
  const mode = process.argv[2];
  // queue 是给 /next 手动跑的，不读 stdin（没有输入时读 stdin 会一直等）
  const input = mode === 'queue' ? {} : readStdin();
  // 和 CLI 一样先解析软链接（macOS 的 /var → /private/var），否则两边算出的记忆目录对不上
  let root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  try {
    root = fs.realpathSync(root);
  } catch {}
  const cfg = readJSONSafe(path.join(root, '.claude', 'claude-task.json')) || {};
  if (mode === 'queue') process.stdout.write(formatQueue(readQueue(root)));
  else if (mode === 'session-start') sessionStart(input, root, cfg);
  else if (mode === 'user-prompt-submit') userPromptSubmit(input, cfg);
}

// 被 CLI import 时只导出函数，不执行
try {
  if (fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) main();
} catch {}
