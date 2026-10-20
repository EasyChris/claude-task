// 规划草稿的 AI 整理：一个草稿对应一个 claude 会话；对话记录放 ~/.claude-task/chats，不进仓库
import fs from 'node:fs';
import path from 'node:path';
import { claudeTaskHome, projectSlug } from '../../util.mjs';
import { backlogDir, backlogFile, getBacklog, listBacklog, updateBacklog } from '../backlog.mjs';
import { setFrontmatter } from '../frontmatter.mjs';
import { HttpError, writeAtomic } from '../fsutil.mjs';
import { runClaude } from './claude.mjs';
import { claudeArgs, firstPrompt, followupPrompt, formatDraft, normalize, systemPrompt } from './prompt.mjs';

const MAX_RUNS = 3;
const runs = new Map();
const key = (root, id) => `${root}\n${id}`;
const chatFile = (root, id) => path.join(claudeTaskHome(), 'chats', projectSlug(root), `${id}.json`);
// claude 的工作目录单独放：会话记录记在这里，不混进项目自己的记忆
const workDir = () => path.join(claudeTaskHome(), 'ai-work');
const imageLinks = (text) => [...new Set([...String(text).matchAll(/!\[[^\]]*\]\((assets\/[^)\s]+)\)/g)].map((m) => m[1]))];

export function loadChat(root, id) {
  try {
    return JSON.parse(fs.readFileSync(chatFile(root, id), 'utf8'));
  } catch {
    return null;
  }
}

const saveChat = (root, id, chat) => writeAtomic(chatFile(root, id), JSON.stringify(chat, null, 2) + '\n');
export const removeChat = (root, id) => fs.rmSync(chatFile(root, id), { force: true });

function userName(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, '.claude', 'claude-task.json'), 'utf8')).name || '用户';
  } catch {
    return '用户';
  }
}

export const isRunning = (root, id) => runs.has(key(root, id));

export function getChat(root, id) {
  return { item: getBacklog(root, id), chat: loadChat(root, id), running: isRunning(root, id) };
}

// 规划列表里给草稿带上 AI 状态（整理中 / 几个问题待回答 / 整理了几轮）
export function annotate(root, items) {
  return items.map((i) => {
    if (i.status !== 'draft') return i;
    const c = loadChat(root, i.id);
    return { ...i, running: isRunning(root, i.id), questions: c?.questions?.length || 0, rounds: c?.rounds || 0, lastError: c?.lastError || null };
  });
}

const userText = (msg, ans) => [...ans.map((a) => `${a.q}\n→ ${a.a}`), msg].filter(Boolean).join('\n\n');

export function startRun(root, id, { message, answers, useProject } = {}, { emit }) {
  const k = key(root, id);
  if (runs.has(k)) throw new HttpError(409, '这条正在整理中，等它结束或先停止');
  if (runs.size >= MAX_RUNS) throw new HttpError(429, `同时最多整理 ${MAX_RUNS} 条，等其他的结束再来`);
  const item = getBacklog(root, id);
  if (item.status !== 'draft') throw new HttpError(400, '已经确认过的规划不能再整理');
  const chat = loadChat(root, id) || { original: item.body, messages: [], questions: [], references: [], rounds: 0 };
  if (useProject !== undefined) chat.useProject = Boolean(useProject);
  chat.useProject ??= true;
  const msg = String(message || '').trim();
  const ans = (Array.isArray(answers) ? answers : []).map((a) => ({ q: String(a?.q || ''), a: String(a?.a || '').trim() })).filter((a) => a.a);
  const first = !chat.rounds;
  if (!first && !msg && !ans.length) throw new HttpError(400, '说点什么，或者回答一下待确认的问题');

  const name = userName(root);
  const images = imageLinks(`${item.body}\n${msg}`).map((r) => path.join(backlogDir(root), r));
  const prompt = first
    ? firstPrompt({ title: item.title, body: item.body, message: msg, images })
    : followupPrompt({ name, message: msg, answers: ans, draft: `# ${item.title}\n\n${item.body}`, images });
  chat.messages.push({ role: 'user', text: userText(msg, ans) || '帮我整理这份草稿', at: Date.now() });
  chat.lastError = null;
  saveChat(root, id, chat);

  const ev = (kind, data = {}) => emit(kind, data);
  fs.mkdirSync(workDir(), { recursive: true });
  const run = runClaude({
    args: claudeArgs({ root, system: systemPrompt({ name, root, useProject: chat.useProject }), sessionId: chat.sessionId, useProject: chat.useProject, model: process.env.CLAUDE_TASK_AI_MODEL }),
    input: prompt,
    cwd: workDir(),
    onEvent: (e) => ev(e.kind, e.kind === 'tool' ? { name: e.name, target: e.target.startsWith(`${root}/`) ? e.target.slice(root.length + 1) : e.target } : e),
  });
  runs.set(k, run);
  ev('start');
  run.promise.then((r) => finish(root, id, chat, r, ev, k));
  return { ok: true };
}

function finish(root, id, chat, r, ev, k) {
  runs.delete(k);
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
  let item;
  try {
    item = getBacklog(root, id);
  } catch {
    save();
    return ev('error', { error: '这条规划已经不在了' });
  }
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

export function stopRun(root, id) {
  runs.get(key(root, id))?.stop();
  return { ok: true };
}

export function stopAll() {
  for (const r of runs.values()) r.stop();
}

// 确认：没回答的问题按建议默认值记进正文，排到待执行队列末尾，标上 approved
export function approveDraft(root, id) {
  if (isRunning(root, id)) throw new HttpError(409, '还在整理中，等它结束再确认');
  const file = backlogFile(root, id);
  const chat = loadChat(root, id);
  let text = fs.readFileSync(file, 'utf8');
  const open = chat?.questions || [];
  if (open.length) {
    const lines = open.map((q) => `- ${q.q} → 默认：${q.suggestion || '（未定，开工时再问）'}`);
    text = `${text.trimEnd()}\n\n## 待确认（按建议默认处理）\n\n${lines.join('\n')}\n`;
  }
  const order = Math.max(0, ...listBacklog(root).filter((i) => i.status !== 'draft').map((i) => i.order)) + 1;
  writeAtomic(file, setFrontmatter(text, { status: 'queued', approved: 'true', order }));
  if (chat) {
    chat.questions = [];
    chat.approvedAt = Date.now();
    saveChat(root, id, chat);
  }
  return getBacklog(root, id);
}
