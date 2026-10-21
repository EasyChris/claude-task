// 读 Claude Code 的会话原文（~/.claude/projects/<项目>/<会话 id>.jsonl），整理成页面能直接画的条目
// 格式是 Claude Code 内部的，可能随版本变：看不懂的行直接跳过，不报错
import fs from 'node:fs';
import path from 'node:path';
import { claudeConfigDir } from '../../templates/claude-task-memdir.mjs';
import { projectSlug } from '../util.mjs';
import { HttpError } from './fsutil.mjs';

export const SESSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const LIVE_MS = 2 * 60 * 1000;
const MAX_RESULT = 4000;
const MAX_INPUT = 2000;
const MAX_CHUNK = 8 * 1024 * 1024; // 一次最多读 8MB，大会话分几次拉

export const transcriptDir = (root) => path.join(claudeConfigDir(), 'projects', projectSlug(root));

export function transcriptFile(root, id) {
  if (!SESSION_RE.test(id)) throw new HttpError(400, '会话 id 格式不对');
  return path.join(transcriptDir(root), `${id}.jsonl`);
}

const cut = (s, n) => (s.length > n ? `${s.slice(0, n)}\n…（还有 ${s.length - n} 字没显示）` : s);
const rel = (root, p) => (typeof p === 'string' && p.startsWith(`${root}/`) ? p.slice(root.length + 1) : p);

// 去掉注入给 Claude 的系统提醒，只留用户真正打的字
export const cleanUserText = (s) => String(s).replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();

function commandText(s) {
  const name = /<command-name>([\s\S]*?)<\/command-name>/.exec(s)?.[1];
  if (!name) return null;
  const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(s)?.[1] || '';
  return `${name.trim()} ${args.trim()}`.trim();
}

function toolSummary(root, input = {}) {
  const v = input.command ?? input.file_path ?? input.notebook_path ?? input.pattern ?? input.url ?? input.query ?? input.description ?? '';
  return String(rel(root, v)).split('\n')[0].slice(0, 200);
}

function resultText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((c) => (c.type === 'text' ? c.text : c.type === 'image' ? '[图片]' : '')).filter(Boolean).join('\n');
}

// 一行 jsonl → 0~N 个条目；子代理（sidechain）和注入的内容（isMeta）不显示
export function lineItems(root, x) {
  if (!x || typeof x !== 'object' || x.isSidechain || x.isMeta) return [];
  const ts = x.timestamp || null;
  if (x.isCompactSummary) return [{ k: 'event', text: '上下文已压缩，之前的对话由摘要代替', ts }];
  const c = x.message?.content;
  if (x.type === 'user') {
    if (typeof c === 'string') {
      const cmd = commandText(c);
      if (cmd) return [{ k: 'command', text: cmd, ts }];
      if (/^<(local-command-stdout|local-command-stderr|command-message)>/.test(c)) return [];
      const text = cleanUserText(c);
      return text ? [{ k: 'user', text, ts }] : [];
    }
    if (!Array.isArray(c)) return [];
    const out = [];
    const text = c.filter((b) => b.type === 'text').map((b) => cleanUserText(b.text)).filter(Boolean).join('\n\n');
    const images = c.filter((b) => b.type === 'image').length;
    if (text || images) out.push({ k: 'user', text, images, ts });
    for (const b of c) {
      if (b.type === 'tool_result') out.push({ k: 'result', id: b.tool_use_id, text: cut(resultText(b.content), MAX_RESULT), error: Boolean(b.is_error), ts });
    }
    return out;
  }
  if (x.type === 'assistant' && Array.isArray(c)) {
    return c.flatMap((b) => {
      if (b.type === 'text' && b.text?.trim()) return [{ k: 'text', text: b.text, ts }];
      if (b.type === 'thinking' && b.thinking?.trim()) return [{ k: 'thinking', text: b.thinking, ts }];
      if (b.type === 'tool_use') {
        return [{ k: 'tool', id: b.id, name: b.name, summary: toolSummary(root, b.input), input: cut(JSON.stringify(b.input ?? {}, null, 2), MAX_INPUT), ts }];
      }
      return [];
    });
  }
  return [];
}

// 从字节位置 from 开始读；只处理完整的行，正在写的半行留到下次（页面拿 next 接着拉，实现实时滚动）
export function readTranscript(root, id, from = 0) {
  const file = transcriptFile(root, id);
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    throw new HttpError(404, '找不到这个会话的记录（可能已被 Claude Code 清理）');
  }
  const start = Math.max(0, Math.min(Number(from) || 0, st.size));
  const len = Math.min(st.size - start, MAX_CHUNK);
  const buf = Buffer.alloc(len);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, buf, 0, len, start);
  } finally {
    fs.closeSync(fd);
  }
  const end = buf.lastIndexOf(0x0a);
  const items = [];
  if (end >= 0) {
    for (const line of buf.subarray(0, end + 1).toString('utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        items.push(...lineItems(root, JSON.parse(line)));
      } catch {}
    }
  }
  const next = start + end + 1;
  return { id, items, next, more: len === MAX_CHUNK && next < st.size, live: Date.now() - st.mtimeMs < LIVE_MS };
}
