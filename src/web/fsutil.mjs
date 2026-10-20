import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 接口层的错误：status 是 HTTP 状态码，data 会合并进返回的 JSON
export class HttpError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export const hash = (text) => crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);

export const pad2 = (n) => String(n).padStart(2, '0');

export const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

export function readTextOr(file, fallback = null) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return fallback;
  }
}

// 先写临时文件再改名：Claude 或编辑器不会读到写了一半的文件
export function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.ct-tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

export function nowStamp(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function expandHome(p) {
  const s = String(p || '').trim();
  if (s === '~') return os.homedir();
  return s.startsWith('~/') ? path.join(os.homedir(), s.slice(2)) : s;
}
