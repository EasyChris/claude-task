// 网页上对 task 文件的改动：都是「读最新 → 只改对应的行 → 原子写回」，不和 Claude 互相覆盖
import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter, setFrontmatter } from './frontmatter.mjs';
import { HttpError, hash, nowStamp, writeAtomic } from './fsutil.mjs';
import { syncIndexes } from './sync.mjs';
import { STATUSES } from './status.mjs';
import { loadTask, parseSubtasks, parseTask, readDayIndex, resolveTask } from './tasks.mjs';

const CHECK_LINE = /^(\s*[-*+] \[)([ xX])(\] )(.*?)(\r?)$/;
const H2 = /^##\s/;

export function getTask(root, id) {
  const { file, date, num } = resolveTask(root, id);
  const index = readDayIndex(path.dirname(file));
  const { text, task } = loadTask(root, date, num, index.get(num) || '');
  return {
    ...task,
    file: path.relative(root, file),
    dir: path.relative(root, path.dirname(file)),
    content: text,
    hash: hash(text),
    offset: parseFrontmatter(text).offset,
    subtasks: parseSubtasks(text),
  };
}

function edit(root, id, fn) {
  const { file } = resolveTask(root, id);
  const next = fn(fs.readFileSync(file, 'utf8'));
  if (next !== null) writeAtomic(file, next);
  return getTask(root, id);
}

export function toggleSubtask(root, id, { line, done, text }) {
  return edit(root, id, (src) => {
    const lines = src.split('\n');
    const m = CHECK_LINE.exec(lines[Number(line)] ?? '');
    if (!m || (text !== undefined && m[4].trim() !== String(text).trim())) {
      throw new HttpError(409, '文件刚被改过，这一行对不上了；页面已刷新，请再点一次');
    }
    lines[line] = `${m[1]}${done ? 'x' : ' '}${m[3]}${m[4]}${m[5]}`;
    return lines.join('\n');
  });
}

// 「## 子任务」一节里最后一个勾选框之后；没有这一节就放在最后一个勾选框之后；都没有就新建这一节
function insertAt(lines, subtasks) {
  const head = lines.findIndex((l) => /^##\s*子任务/.test(l));
  if (head >= 0) {
    let end = lines.findIndex((l, i) => i > head && H2.test(l));
    if (end < 0) end = lines.length;
    const inSection = subtasks.filter((s) => s.line > head && s.line < end);
    if (inSection.length) return { at: inSection.at(-1).line + 1 };
    return { at: head + 1, before: [''] };
  }
  if (subtasks.length) return { at: subtasks.at(-1).line + 1 };
  const summary = lines.findIndex((l) => /^##\s*总结/.test(l));
  return summary >= 0
    ? { at: summary, before: ['## 子任务', ''], after: [''] }
    : { at: lines.length, before: ['', '## 子任务', ''] };
}

export function addSubtask(root, id, { text }) {
  const item = String(text || '').replace(/\s+/g, ' ').trim();
  if (!item) throw new HttpError(400, '子任务内容不能为空');
  return edit(root, id, (src) => {
    const lines = src.split('\n');
    const { at, before = [], after = [] } = insertAt(lines, parseSubtasks(src));
    lines.splice(at, 0, ...before, `- [ ] ${item}`, ...after);
    return lines.join('\n');
  });
}

// 旧文件第一次改状态时补上 frontmatter（id / title / created），同时改当日、月度索引里那一行
export function setStatus(root, id, { status }) {
  if (!STATUSES.includes(status)) throw new HttpError(400, `不认识的状态：${status}`);
  const { file, date, num } = resolveTask(root, id);
  const src = fs.readFileSync(file, 'utf8');
  const { data } = parseFrontmatter(src);
  const { title } = parseTask(src, { date, num });
  const fields = {};
  if (!data?.id) fields.id = id;
  if (!data?.title) fields.title = title;
  fields.status = status;
  if (!data?.created) fields.created = `${date}T00:00`;
  if (status === 'done' && !data?.completed) fields.completed = nowStamp();
  writeAtomic(file, setFrontmatter(src, fields));
  syncIndexes(root, { date, num, title, status, fileName: path.basename(file) });
  return getTask(root, id);
}

export function saveContent(root, id, { content, hash: base }) {
  if (typeof content !== 'string') throw new HttpError(400, '缺少 content');
  return edit(root, id, (cur) => {
    if (base && hash(cur) !== base) {
      throw new HttpError(409, '你编辑期间文件被改过了', { current: cur, hash: hash(cur) });
    }
    return cur === content ? null : content;
  });
}

// 在「## 附件」一节末尾加一行图片；没有这一节就加在文件末尾
export function appendAttachment(root, id, rel) {
  return edit(root, id, (src) => {
    const lines = src.replace(/\s+$/, '').split('\n');
    const link = `![截图](${rel})`;
    const head = lines.findIndex((l) => /^##\s*附件/.test(l));
    if (head < 0) return `${lines.join('\n')}\n\n## 附件\n\n${link}\n`;
    let end = lines.findIndex((l, i) => i > head && H2.test(l));
    if (end < 0) end = lines.length;
    while (end - 1 > head && !lines[end - 1].trim()) end--;
    lines.splice(end, 0, ...(end === head + 1 ? [''] : []), link);
    return `${lines.join('\n')}\n`;
  });
}
