// 多项目：读写 ~/.claude-task/projects.json、扫描目录找旧项目、总览页的统计
import fs from 'node:fs';
import path from 'node:path';
import { needsMigrate, projectKind } from '../claudemd.mjs';
import { assignIds, registryFile, sortProjects } from '../registry.mjs';
import { localDate, readJSON, resolveRoot, tildify } from '../util.mjs';
import { listBacklog } from './backlog.mjs';
import { HttpError, expandHome, safeReaddir, writeAtomic } from './fsutil.mjs';
import { DAY_RE, TASK_FILE_RE, listTasks } from './tasks.mjs';

function readRegistry() {
  try {
    return readJSON(registryFile())?.projects || [];
  } catch (e) {
    throw new HttpError(500, e.message);
  }
}

const save = (projects) => writeAtomic(registryFile(), JSON.stringify({ projects: sortProjects(projects) }, null, 2) + '\n');

export function readProjects() {
  const raw = readRegistry();
  const projects = assignIds(raw);
  if (projects.some((p, i) => p.id !== raw[i].id)) save(projects); // 补上的 id 存下来，网址才稳定
  return projects;
}

export function findProject(id) {
  const p = readProjects().find((x) => x.id === id);
  if (!p) throw new HttpError(404, '列表里没有这个项目');
  if (!fs.existsSync(p.path)) throw new HttpError(410, `项目目录不存在了：${tildify(p.path)}`);
  return p;
}

export function addProjects(paths) {
  if (!Array.isArray(paths) || !paths.length) throw new HttpError(400, '没有选择项目');
  const list = readProjects();
  for (const raw of paths) {
    const root = resolveRoot(expandHome(raw));
    if (!fs.existsSync(path.join(root, 'docs', 'tasks')) && !fs.existsSync(path.join(root, 'CLAUDE.md'))) {
      throw new HttpError(400, `${raw} 不像项目目录（没有 docs/tasks 也没有 CLAUDE.md）`);
    }
    if (!list.some((p) => p.path === root)) list.push({ path: root, name: path.basename(root), addedAt: new Date().toISOString() });
  }
  save(assignIds(list));
}

// 只是从列表里移出，不动项目里的任何文件
export function removeProject(id) {
  const list = readProjects();
  if (!list.some((p) => p.id === id)) throw new HttpError(404, '列表里没有这个项目');
  save(list.filter((p) => p.id !== id));
}

// 接入情况 + 要不要 migrate，扫描结果和总览卡片都带上
function kindOf(root) {
  const kind = projectKind(root);
  return { kind, migrate: needsMigrate(kind) };
}

function countTasks(root) {
  const base = path.join(root, 'docs', 'tasks');
  return safeReaddir(base).filter((d) => DAY_RE.test(d)).reduce((n, d) => {
    const nums = new Set(safeReaddir(path.join(base, d)).map((f) => TASK_FILE_RE.exec(f)?.[1]).filter(Boolean));
    return n + nums.size;
  }, 0);
}

const SKIP = new Set(['node_modules', 'dist', 'build', 'vendor', 'Library', 'Applications']);

// 只读：往下找两层，有 docs/tasks 的目录就算一个项目
export function scan(dir) {
  const base = resolveRoot(expandHome(dir || '~/code'));
  if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) throw new HttpError(400, `目录不存在：${dir}`);
  const registered = new Set(readProjects().map((p) => p.path));
  const found = [];
  const visit = (d, depth) => {
    if (fs.existsSync(path.join(d, 'docs', 'tasks'))) {
      found.push({ path: d, display: tildify(d), name: path.basename(d), tasks: countTasks(d), ...kindOf(d), registered: registered.has(d) });
      return;
    }
    if (depth >= 2) return;
    for (const f of safeReaddir(d)) {
      if (f.startsWith('.') || SKIP.has(f)) continue;
      const p = path.join(d, f);
      try {
        if (fs.statSync(p).isDirectory()) visit(p, depth + 1);
      } catch {}
    }
  };
  visit(base, 0);
  return { dir: tildify(base), projects: found.sort((a, b) => b.tasks - a.tasks || a.name.localeCompare(b.name)) };
}

const WAITING = ['queued', 'planning', 'awaiting_approval'];

export function summarize(p) {
  const base = { id: p.id, name: p.name, path: tildify(p.path) };
  if (!fs.existsSync(p.path)) return { ...base, missing: true };
  const tasks = listTasks(p.path);
  const { month } = localDate();
  const active = tasks.filter((t) => t.status === 'in_progress' && !t.stale);
  return {
    ...base,
    ...kindOf(p.path),
    counts: {
      active: active.length,
      waiting: tasks.filter((t) => WAITING.includes(t.status)).length,
      awaiting: tasks.filter((t) => t.status === 'awaiting_approval').length,
      backlog: listBacklog(p.path).length,
      doneMonth: tasks.filter((t) => t.status === 'done' && (t.completed || t.date).startsWith(month)).length,
      total: tasks.length,
    },
    last: tasks[0]?.date || null,
    active: active.slice(0, 5).map(({ id, title, progress, date, num }) => ({ id, title, progress, date, num })),
  };
}
