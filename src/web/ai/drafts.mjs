// 规划草稿的 AI 整理：一个草稿对应一个 claude 会话；同时最多跑 MAX_RUNS 条，其余排队，一条结束自动开下一条
import fs from 'node:fs';
import path from 'node:path';
import { claudeTaskHome } from '../../util.mjs';
import { backlogDir, getBacklog, updateBacklog } from '../backlog.mjs';
import { HttpError } from '../fsutil.mjs';
import { loadChat, removeChat, saveChat, userName } from './chat.mjs';
import { runClaude, userAuth } from './claude.mjs';
import { claudeArgs, firstPrompt, followupPrompt, formatDraft, normalize, systemPrompt } from './prompt.mjs';

export { loadChat, removeChat } from './chat.mjs';

export const MAX_RUNS = 3;
const runs = new Map();
// 排队中的：{ k, root, id, opts, emit }，先来先跑
const waiting = [];
const key = (root, id) => `${root}\n${id}`;
// claude 的工作目录单独放：会话记录记在这里，不混进项目自己的记忆
const workDir = () => path.join(claudeTaskHome(), 'ai-work');
const imageLinks = (text) => [...new Set([...String(text).matchAll(/!\[[^\]]*\]\((assets\/[^)\s]+)\)/g)].map((m) => m[1]))];

export const isRunning = (root, id) => runs.has(key(root, id));
export const isQueued = (root, id) => waiting.some((w) => w.k === key(root, id));

export function getChat(root, id) {
  return { item: getBacklog(root, id), chat: loadChat(root, id), running: isRunning(root, id), queued: isQueued(root, id) };
}

// 规划列表里给草稿带上 AI 状态（排队中 / 整理中 / 几个问题待回答 / 整理了几轮 / 出错）
export function annotate(root, items) {
  return items.map((i) => {
    if (i.status !== 'draft') return i;
    const c = loadChat(root, i.id);
    return {
      ...i, running: isRunning(root, i.id), queued: isQueued(root, i.id),
      questions: c?.questions?.length || 0, rounds: c?.rounds || 0, lastError: c?.lastError || null,
    };
  });
}

const userText = (msg, ans) => [...ans.map((a) => `${a.q}\n→ ${a.a}`), msg].filter(Boolean).join('\n\n');

// 先检查能不能整理（不能就直接报错，不进队列）；对话记录等真正开跑时再写
function check(root, id, { message, answers } = {}) {
  if (isRunning(root, id)) throw new HttpError(409, '这条正在整理中，等它结束或先停止');
  if (isQueued(root, id)) throw new HttpError(409, '这条已经在排队了');
  const item = getBacklog(root, id);
  if (item.status !== 'draft') throw new HttpError(400, '已经确认过的规划不能再整理');
  const msg = String(message || '').trim();
  const ans = (Array.isArray(answers) ? answers : []).map((a) => ({ q: String(a?.q || ''), a: String(a?.a || '').trim() })).filter((a) => a.a);
  if (loadChat(root, id)?.rounds && !msg && !ans.length) throw new HttpError(400, '说点什么，或者回答一下待确认的问题');
  return { msg, ans };
}

export function startRun(root, id, opts = {}, { emit }) {
  const { msg, ans } = check(root, id, opts);
  const job = { k: key(root, id), root, id, opts: { useProject: opts.useProject, msg, ans }, emit };
  if (runs.size >= MAX_RUNS) {
    waiting.push(job);
    emit('queued');
    return { ok: true, queued: true };
  }
  launch(job);
  return { ok: true };
}

// 批量整理：只收还没整理过的草稿（整理过的要在草稿页回答问题或继续对话）；每条单独报结果
export function startBatch(root, ids, { useProject } = {}, emitFor) {
  if (!Array.isArray(ids) || !ids.length) throw new HttpError(400, '先勾选要整理的草稿');
  const results = ids.map((id) => {
    try {
      if (loadChat(root, id)?.rounds) throw new HttpError(400, '已经整理过了，去草稿页回答问题或继续对话');
      return { id, ...startRun(root, id, { useProject }, { emit: emitFor(id) }) };
    } catch (e) {
      return { id, error: e.message };
    }
  });
  return { results };
}

function launch({ k, root, id, opts, emit }) {
  const item = getBacklog(root, id);
  const chat = loadChat(root, id) || { original: item.body, messages: [], questions: [], references: [], rounds: 0 };
  if (opts.useProject !== undefined) chat.useProject = Boolean(opts.useProject);
  chat.useProject ??= true;
  const { msg, ans } = opts;
  const first = !chat.rounds;

  const name = userName(root);
  const images = imageLinks(`${item.body}\n${msg}`).map((r) => path.join(backlogDir(root), r));
  const prompt = first
    ? firstPrompt({ title: item.title, body: item.body, message: msg, images })
    : followupPrompt({ name, message: msg, answers: ans, draft: `# ${item.title}\n\n${item.body}`, images });
  chat.messages.push({ role: 'user', text: userText(msg, ans) || '帮我整理这份草稿', at: Date.now() });
  chat.lastError = null;
  saveChat(root, id, chat);

  fs.mkdirSync(workDir(), { recursive: true });
  const auth = userAuth();
  const run = runClaude({
    args: claudeArgs({ root, system: systemPrompt({ name, root, useProject: chat.useProject }), sessionId: chat.sessionId, useProject: chat.useProject, model: process.env.CLAUDE_TASK_AI_MODEL, auth }),
    input: prompt,
    cwd: workDir(),
    env: auth.env,
    onEvent: (e) => emit(e.kind, e.kind === 'tool' ? { name: e.name, target: e.target.startsWith(`${root}/`) ? e.target.slice(root.length + 1) : e.target } : e),
  });
  runs.set(k, run);
  emit('start');
  run.promise.then((r) => {
    runs.delete(k);
    try {
      finish(root, id, chat, r, emit);
    } finally {
      pump();
    }
  });
}

// 有空位就从队头开跑下一条；那条要是已经被删了或不能整理了，报个错跳过
function pump() {
  while (runs.size < MAX_RUNS && waiting.length) {
    const job = waiting.shift();
    try {
      launch(job);
    } catch (e) {
      job.emit('error', { error: e.message });
    }
  }
}

function finish(root, id, chat, r, ev) {
  // 整理途中草稿被删了：对话记录也不留
  if (!fs.existsSync(path.join(backlogDir(root), `${id}.md`))) {
    removeChat(root, id);
    return ev('error', { error: '这条规划已经不在了' });
  }
  const save = () => saveChat(root, id, chat);
  if (r.sessionId) chat.sessionId = r.sessionId;
  if (r.stopped) {
    chat.messages.push({ role: 'system', text: '已停止', at: Date.now() });
    save();
    return ev('done', { stopped: true });
  }
  const out = normalize(r.result?.structured_output);
  if (r.error || !out) {
    const error = r.error || 'AI 没按格式返回，再试一次';
    // 会话接不上（比如被清理了）：下次从当前草稿重新开一个会话
    if (/no conversation|not found|session/i.test(error)) chat.sessionId = null;
    chat.lastError = error;
    save();
    return ev('error', { error });
  }
  const item = getBacklog(root, id);
  chat.prevBody = item.body;
  const userImages = chat.messages.filter((m) => m.role === 'user').map((m) => m.text).join('\n');
  updateBacklog(root, id, { title: out.title, body: formatDraft(out, imageLinks(`${chat.original}\n${item.body}\n${userImages}`)) });
  chat.messages.push({ role: 'assistant', text: out.reply, at: Date.now(), cost: r.result.total_cost_usd ?? null });
  chat.questions = out.questions;
  chat.references = out.references;
  chat.rounds += 1;
  save();
  return ev('done');
}

// 停止：排队中的直接移出队列，正在跑的发信号停掉
export function stopRun(root, id) {
  const k = key(root, id);
  const i = waiting.findIndex((w) => w.k === k);
  if (i >= 0) waiting.splice(i, 1)[0].emit('done', { stopped: true, dequeued: true });
  runs.get(k)?.stop();
  return { ok: true };
}

export function stopAll() {
  waiting.length = 0;
  for (const r of runs.values()) r.stop();
}
