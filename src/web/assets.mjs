// 贴图：存进 docs/tasks/<日期>/assets 或 docs/backlog/assets，也负责把图片安全地读出来
import fs from 'node:fs';
import path from 'node:path';
import { HttpError, escapeRe, safeReaddir } from './fsutil.mjs';

export const IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
export const MAX_IMAGE = 10 * 1024 * 1024;

// 返回新文件名，比如 task-05-3.png
export function saveImage(dir, prefix, buf, type) {
  const ext = IMAGE_TYPES[String(type || '').split(';')[0].trim()];
  if (!ext) throw new HttpError(415, '只支持 png / jpg / gif / webp 图片');
  if (!buf.length) throw new HttpError(400, '图片是空的');
  const re = new RegExp(`^${escapeRe(prefix)}-(\\d+)\\.`);
  const used = safeReaddir(dir).map((f) => Number(re.exec(f)?.[1] || 0));
  const name = `${prefix}-${Math.max(0, ...used) + 1}.${ext}`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), buf);
  return name;
}

// 只放行项目里 docs/tasks、docs/backlog 下面的图片，挡住 ../ 和软链接逃逸
export function resolveImage(root, rel) {
  const clean = path.posix.normalize(String(rel || '').replace(/\\/g, '/'));
  if (!/^docs\/(tasks|backlog)\//.test(clean) || clean.includes('..')) throw new HttpError(403, '不允许访问这个路径');
  const ext = path.extname(clean).slice(1).toLowerCase();
  if (!MIME[ext]) throw new HttpError(403, '只能读取图片');
  const file = path.join(root, clean);
  let real;
  try {
    real = fs.realpathSync(file);
  } catch {
    throw new HttpError(404, '图片不存在');
  }
  if (!real.startsWith(fs.realpathSync(root) + path.sep)) throw new HttpError(403, '不允许访问这个路径');
  // svg 可以带脚本，当附件下载而不是内联渲染
  return { file: real, type: MIME[ext], download: ext === 'svg' };
}
