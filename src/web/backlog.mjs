// 规划队列：docs/backlog/NN-标题.md，frontmatter 存 title / status / priority / order / created
import fs from 'node:fs';
import path from 'node:path';
import { saveImage } from './assets.mjs';
import { parseFrontmatter, setFrontmatter } from './frontmatter.mjs';
import { HttpError, hash, nowStamp, pad2, safeReaddir, writeAtomic } from './fsutil.mjs';

export const PRIORITIES = ['high', 'medium', 'low'];
const FILE_RE = /^(\d+)-.*\.md$/;
const ID_RE = /^\d+-[^/\\]*$/;

export const backlogDir = (root) => path.join(root, 'docs', 'backlog');

// 排序只改 order 一行，不算内容变化，避免拖动排序后编辑框保存时误报冲突
const itemHash = (text) => hash(text.replace(/^order:.*$/m, ''));

function slugify(title) {
  return title.replace(/[\\/:*?"<>|#%&{}$!'@+`=\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'task';
}

export function backlogFile(root, id) {
  if (!ID_RE.test(String(id || '')) || id.includes('..')) throw new HttpError(400, '规划 id 格式不对');
  const file = path.join(backlogDir(root), `${id}.md`);
  if (!fs.existsSync(file)) throw new HttpError(404, '这条规划不存在（可能已经开始或被删除）');
  return file;
}

function readItem(root, name) {
  const text = fs.readFileSync(path.join(backlogDir(root), name), 'utf8');
  const { data, body } = parseFrontmatter(text);
  const num = FILE_RE.exec(name)[1];
  return {
    id: name.slice(0, -3),
    num,
    title: data?.title || name.slice(num.length + 1, -3),
    priority: PRIORITIES.includes(data?.priority) ? data.priority : 'medium',
    order: Number(data?.order) || Number(num),
    created: data?.created || '',
    body: body.replace(/^\s*\n/, '').trimEnd(),
    images: (body.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length,
    hash: itemHash(text),
  };
}

export function listBacklog(root) {
  return safeReaddir(backlogDir(root))
    .filter((f) => FILE_RE.test(f))
    .map((f) => readItem(root, f))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function getBacklog(root, id) {
  backlogFile(root, id);
  return readItem(root, `${id}.md`);
}

const cleanTitle = (t) => String(t || '').replace(/\s+/g, ' ').trim();
const checkPriority = (p) => {
  if (p !== undefined && !PRIORITIES.includes(p)) throw new HttpError(400, '优先级只能是 high / medium / low');
};

export function createBacklog(root, { title, priority = 'medium', body = '' }) {
  const t = cleanTitle(title);
  if (!t) throw new HttpError(400, '标题不能为空');
  checkPriority(priority);
  const items = listBacklog(root);
  const nums = safeReaddir(backlogDir(root)).map((f) => Number(FILE_RE.exec(f)?.[1] || 0));
  const num = pad2(Math.max(0, ...nums) + 1);
  const order = Math.max(0, ...items.map((i) => i.order)) + 1;
  const text = setFrontmatter(`${String(body).trim()}\n`, { title: t, status: 'queued', priority, order, created: nowStamp() });
  const name = `${num}-${slugify(t)}.md`;
  writeAtomic(path.join(backlogDir(root), name), text);
  return readItem(root, name);
}

export function updateBacklog(root, id, { title, priority, body, hash: base }) {
  const file = backlogFile(root, id);
  const cur = fs.readFileSync(file, 'utf8');
  if (base && itemHash(cur) !== base) throw new HttpError(409, '这条规划刚被改过，已刷新，请重新编辑', { item: readItem(root, `${id}.md`) });
  checkPriority(priority);
  const old = parseFrontmatter(cur).body;
  let next = body === undefined ? cur : `${cur.slice(0, cur.length - old.length)}\n${String(body).trim()}\n`;
  const fields = {};
  if (title !== undefined) {
    if (!cleanTitle(title)) throw new HttpError(400, '标题不能为空');
    fields.title = cleanTitle(title);
  }
  if (priority !== undefined) fields.priority = priority;
  next = setFrontmatter(next, fields);
  if (next !== cur) writeAtomic(file, next);
  return readItem(root, `${id}.md`);
}

export function reorderBacklog(root, ids) {
  if (!Array.isArray(ids)) throw new HttpError(400, 'ids 应该是数组');
  ids.forEach((id, i) => {
    const file = backlogFile(root, id);
    const cur = fs.readFileSync(file, 'utf8');
    if (Number(parseFrontmatter(cur).data?.order) !== i + 1) writeAtomic(file, setFrontmatter(cur, { order: i + 1 }));
  });
  return listBacklog(root);
}

const prefixOf = (id) => `bl-${id.split('-')[0]}`;

export function deleteBacklog(root, id) {
  fs.unlinkSync(backlogFile(root, id));
  const dir = path.join(backlogDir(root), 'assets');
  for (const f of safeReaddir(dir)) if (f.startsWith(`${prefixOf(id)}-`)) fs.unlinkSync(path.join(dir, f));
  return listBacklog(root);
}

export function addBacklogImage(root, id, buf, type) {
  backlogFile(root, id);
  const name = saveImage(path.join(backlogDir(root), 'assets'), prefixOf(id), buf, type);
  return { path: `assets/${name}` };
}
