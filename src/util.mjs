import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveMemoryDir } from '../templates/claude-task-memdir.mjs';

export const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BLOCK_START = '<!-- claude-task:start';
export const BLOCK_END = '<!-- claude-task:end -->';
// 带这个标记的文件由 claude-task 维护，update 会覆盖；去掉标记就不再覆盖
export const MANAGED = '<!-- claude-task:managed';

// 给用户看的错误：只打印 message，不打印堆栈
export class UserError extends Error {}

export function pkgVersion() {
  return JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8')).version;
}

// 与 Claude Code 一致：项目绝对路径里的非字母数字字符换成 "-"
export function projectSlug(absPath) {
  return absPath.replace(/[^a-zA-Z0-9]/g, '-');
}

export function claudeConfigDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

export function claudeTaskHome() {
  return process.env.CLAUDE_TASK_HOME || path.join(os.homedir(), '.claude-task');
}

export function tildify(p) {
  const home = os.homedir();
  return p === home || p.startsWith(home + path.sep) ? '~' + p.slice(home.length) : p;
}

// 项目根统一用真实路径，hook 里也这样算，保证两边记忆目录一致
export function resolveRoot(dir) {
  try {
    return fs.realpathSync(dir);
  } catch {
    return path.resolve(dir);
  }
}

// 与 Claude Code 的 auto memory 同一个目录（实现放在 hook 里，CLI 和 hook 共用一份）
export function memoryDir(root) {
  return resolveMemoryDir(root);
}

export function memoryDirDisplay(root) {
  return tildify(memoryDir(root)) + '/';
}

export function localDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  return { month, day: `${month}-${pad(d.getDate())}` };
}

export function readTemplate(name) {
  return fs.readFileSync(path.join(PKG_ROOT, 'templates', name), 'utf8');
}

// 极简模板：{{key}} 取值，{{#key}}…{{/key}} 为真才保留，{{^key}}…{{/key}} 为假才保留
export function render(tpl, vars) {
  return tpl
    .replace(/\{\{([#^])(\w+)\}\}([\s\S]*?)\{\{\/\2\}\}/g, (_, kind, key, body) =>
      (kind === '#') === Boolean(vars[key]) ? body : '')
    .replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''));
}

// 文件不存在返回 null；内容不是合法 JSON 直接报错，避免覆盖掉用户的文件
export function readJSON(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new UserError(`${tildify(file)} 不是合法 JSON，没有改动它：${e.message}`);
  }
}
