// 接口表：每条 [方法, 路径, 处理函数]；/api/p/<项目 id>/... 的路由会先找到项目根目录
import path from 'node:path';
import { resolveImage, saveImage } from './assets.mjs';
import {
  addBacklogImage, createBacklog, createBacklogBatch, deleteBacklog, getBacklog, listBacklog, reorderBacklog, updateBacklog,
} from './backlog.mjs';
import { approveDraft } from './ai/approve.mjs';
import { annotate, getChat, removeChat, startBatch, startRun, stopRun } from './ai/drafts.mjs';
import { migrateBacklog } from './backlogMigrate.mjs';
import { readTranscript } from './transcript.mjs';
import { linkedSessions } from './transcriptLinks.mjs';
import { addSubtask, appendAttachment, getTask, saveContent, setStatus, toggleSubtask } from './edit.mjs';
import { HttpError } from './fsutil.mjs';
import { setQueue } from './queue.mjs';
import { addProjects, findProject, readProjects, removeProject, scan, summarize } from './projects.mjs';
import { getSession, listSessions, relatedSessions } from './sessions.mjs';
import { listTasks, resolveTask } from './tasks.mjs';

const P = '/api/p/([^/]+)';
const T = `${P}/tasks/([^/]+)`;
const B = `${P}/backlog/([^/]+)`;
const R = (method, pattern, fn, body) => ({ method, re: new RegExp(`^${pattern}$`), fn, body, project: pattern.startsWith(P) });

// AI 进度通过 SSE 的 ai 事件推给页面
const aiEmit = (ctx, pid, id) => (kind, data) => ctx.broadcast('ai', { project: pid, id, kind, ...data });

const withSessions = (root, task) => ({ ...task, sessions: relatedSessions(root, task.date, task.num) });

function uploadTaskImage({ root, params, raw, type, url }) {
  const { file, num } = resolveTask(root, params[1]);
  const rel = `assets/${saveImage(path.join(path.dirname(file), 'assets'), `task-${num}`, raw, type)}`;
  if (url.searchParams.get('append') === '0') return { path: rel };
  return { path: rel, task: withSessions(root, appendAttachment(root, params[1], rel)) };
}

const ROUTES = [
  R('GET', '/api/projects', () => ({ projects: readProjects().map(summarize) })),
  R('POST', '/api/projects', ({ json, ctx }) => {
    addProjects(json.paths);
    ctx.refreshWatch();
    return { ok: true };
  }, 'json'),
  R('DELETE', '/api/projects/([^/]+)', ({ params, ctx }) => {
    removeProject(params[0]);
    ctx.refreshWatch();
    return { ok: true };
  }),
  R('GET', '/api/scan', ({ url }) => scan(url.searchParams.get('dir'))),

  R('GET', `${P}/tasks`, ({ root, url }) => ({ tasks: listTasks(root, url.searchParams.get('q')) })),
  R('GET', T, ({ root, params }) => withSessions(root, getTask(root, params[1]))),
  R('POST', `${T}/toggle`, ({ root, params, json }) => withSessions(root, toggleSubtask(root, params[1], json)), 'json'),
  R('POST', `${T}/subtasks`, ({ root, params, json }) => withSessions(root, addSubtask(root, params[1], json)), 'json'),
  R('POST', `${T}/status`, ({ root, params, json }) => withSessions(root, setStatus(root, params[1], json)), 'json'),
  R('PUT', `${T}/content`, ({ root, params, json }) => withSessions(root, saveContent(root, params[1], json)), 'json'),
  R('POST', `${T}/images`, uploadTaskImage, 'raw'),
  // 执行队列：一次写好整个顺序（看板拖进 / 拖出 / 上下拖都走这里）
  R('POST', `${P}/queue`, ({ root, json }) => ({ tasks: setQueue(root, json.ids) }), 'json'),

  // 列出前先把旧版「待执行队列」里的条目转走（幂等）
  R('GET', `${P}/backlog`, ({ root }) => {
    migrateBacklog(root);
    return { items: annotate(root, listBacklog(root)) };
  }),
  R('POST', `${P}/backlog`, ({ root, json }) => createBacklog(root, json), 'json'),
  R('POST', `${P}/backlog/batch`, ({ root, json }) => createBacklogBatch(root, json.items), 'json'),
  // 批量 AI 整理：超过同时上限的排队，一条结束自动开下一条
  R('POST', `${P}/backlog/ai`, ({ root, params, json, ctx }) => startBatch(root, json.ids, json, (id) => aiEmit(ctx, params[0], id)), 'json'),
  R('POST', `${P}/backlog/reorder`, ({ root, json }) => ({ items: annotate(root, reorderBacklog(root, json.ids)) }), 'json'),
  R('GET', B, ({ root, params }) => getBacklog(root, params[1])),
  R('PUT', B, ({ root, params, json }) => updateBacklog(root, params[1], json), 'json'),
  R('DELETE', B, ({ root, params }) => {
    stopRun(root, params[1]);
    removeChat(root, params[1]);
    return { items: annotate(root, deleteBacklog(root, params[1])) };
  }),
  R('POST', `${B}/images`, ({ root, params, raw, type }) => addBacklogImage(root, params[1], raw, type), 'raw'),
  // 完整对话（只读）：任务关联了哪些会话、某个会话的原文（from = 上次读到的字节位置，用来实时追加）
  R('GET', `${T}/conversations`, ({ root, params }) => ({ sessions: linkedSessions(root, getTask(root, params[1])) })),
  R('GET', `${P}/transcripts/([^/]+)`, ({ root, params, url }) => readTranscript(root, params[1], url.searchParams.get('from'))),
  R('GET', `${B}/chat`, ({ root, params }) => getChat(root, params[1])),
  R('POST', `${B}/ai`, ({ root, params, json, ctx }) => startRun(root, params[1], json, { emit: aiEmit(ctx, params[0], params[1]) }), 'json'),
  R('POST', `${B}/ai/stop`, ({ root, params }) => stopRun(root, params[1])),
  // 确认 = 转成今天的 task 文件上看板，返回新 task id
  R('POST', `${B}/approve`, ({ root, params }) => approveDraft(root, params[1])),

  R('GET', `${P}/sessions`, ({ root }) => ({ sessions: listSessions(root) })),
  R('GET', `${P}/session`, ({ root, url }) => getSession(root, url.searchParams.get('name'))),
  R('GET', `${P}/file`, ({ root, url }) => ({ __file: resolveImage(root, url.searchParams.get('path')) })),
];

function decode(parts) {
  try {
    return parts.map(decodeURIComponent);
  } catch {
    throw new HttpError(400, '网址编码不对');
  }
}

export async function handleApi(req, url, ctx, read) {
  for (const r of ROUTES) {
    if (r.method !== req.method) continue;
    const m = r.re.exec(url.pathname);
    if (!m) continue;
    const params = decode(m.slice(1));
    const args = { url, params, ctx, root: r.project ? findProject(params[0]).path : null };
    if (r.body === 'json') args.json = await read.json(req);
    if (r.body === 'raw') {
      args.raw = await read.raw(req);
      args.type = req.headers['content-type'];
    }
    return r.fn(args);
  }
  throw new HttpError(404, '没有这个接口');
}
