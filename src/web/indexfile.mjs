// 当日 / 月度索引里某个任务那一行：两种写法都要认
//   列表：- [task-01](task-01.md) 标题 — ✅ 已完成
//   表格：| 1 | 标题 | ✅ 已完成 | [task-01.md](task-01.md) |
import { LABEL, statusFromText } from './status.mjs';

const isRow = (line) => line.trim().startsWith('|');
const isSeparator = (line) => /^\s*\|[\s:|-]+\|\s*$/.test(line);
const SEP = ' — ';

export function cells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
}

export function headerCells(lines) {
  const h = lines.find((l) => isRow(l) && !isSeparator(l) && cells(l).some((c) => c.trim() === '状态'));
  return h ? cells(h).map((c) => c.trim()) : null;
}

function statusCol(line, header) {
  const cs = cells(line);
  const byHeader = header ? header.indexOf('状态') : -1;
  if (byHeader >= 0 && byHeader < cs.length) return byHeader;
  return cs.findIndex((c) => !/task-\d+[\w.-]*\.md/.test(c) && statusFromText(c));
}

export function rowStatus(line, header) {
  if (isRow(line)) {
    const k = statusCol(line, header);
    return k >= 0 ? cells(line)[k].trim() : '';
  }
  const k = line.lastIndexOf(SEP);
  return k >= 0 ? line.slice(k + SEP.length).trim() : '';
}

function replaceStatus(line, header, label) {
  if (isRow(line)) {
    const cs = cells(line);
    const k = statusCol(line, header);
    if (k < 0) return line;
    cs[k] = ` ${label} `;
    return `|${cs.join('|')}|`;
  }
  const k = line.lastIndexOf(SEP);
  return `${k >= 0 ? line.slice(0, k) : line.trimEnd()}${SEP}${label}`;
}

// 当日索引：任务号 → 那一行的状态文字
export function readIndexStatuses(text) {
  const lines = String(text || '').split('\n');
  const header = headerCells(lines);
  const map = new Map();
  for (const line of lines) {
    const m = /task-(\d+)(?:-[\w.-]*)?\.md/.exec(line);
    if (m && !map.has(m[1])) map.set(m[1], rowStatus(line, header));
  }
  return map;
}

// 改某个任务那一行的状态；没有这一行且给了 values/listLine 就补一行
export function updateIndex(text, { re, status, values, listLine }) {
  const lines = text.split('\n');
  const header = headerCells(lines);
  const i = lines.findIndex((l) => re.test(l));
  if (i >= 0) {
    if (statusFromText(rowStatus(lines[i], header)) === status) return text;
    lines[i] = replaceStatus(lines[i], header, LABEL[status]);
    return lines.join('\n');
  }
  if (!values) return text;
  if (header) {
    let last = -1;
    lines.forEach((l, k) => { if (isRow(l)) last = k; });
    lines.splice(last + 1, 0, `| ${header.map((h) => values[h] ?? '').join(' | ')} |`);
    return lines.join('\n');
  }
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  if (lines.length === 1) lines.push('');
  lines.push(listLine, '');
  return lines.join('\n');
}
