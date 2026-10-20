// HTTP 小工具：读请求体、回 JSON、发静态文件、校验来源
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { MAX_IMAGE } from './assets.mjs';
import { HttpError } from './fsutil.mjs';

const MAX_JSON = 2 * 1024 * 1024;
const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};
export const COOKIE = 'ct_token';
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, `内容太大（上限 ${Math.round(limit / 1048576)}MB）`));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export const read = {
  async json(req) {
    const buf = await readBody(req, MAX_JSON);
    try {
      return buf.length ? JSON.parse(buf.toString('utf8')) : {};
    } catch {
      throw new HttpError(400, '请求内容不是合法 JSON');
    }
  },
  raw: (req) => readBody(req, MAX_IMAGE),
};

export function sendJSON(res, status, data) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

export function sendFile(res, { file, type, download }) {
  const headers = { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': 'no-cache' };
  if (download) headers['Content-Disposition'] = 'attachment';
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}

// 前端构建产物；找不到的路径交给前端路由（返回 index.html）
export function sendStatic(res, distDir, pathname) {
  const rel = path.posix.normalize(decodeURIComponent(pathname)).replace(/^\/+/, '');
  let file = path.join(distDir, rel);
  if (rel.includes('..') || !file.startsWith(distDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(distDir, 'index.html');
  }
  if (!fs.existsSync(file)) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('前端还没构建：在仓库里运行 npm run build:web');
  }
  const ext = path.extname(file);
  const cache = rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': STATIC_TYPES[ext] || 'application/octet-stream',
    'Cache-Control': cache,
    ...(ext === '.html' ? { 'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'" } : {}),
  });
  fs.createReadStream(file).pipe(res);
}

export function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const k = part.indexOf('=');
    if (k > 0) out[part.slice(0, k).trim()] = decodeURIComponent(part.slice(k + 1).trim());
  }
  return out;
}

export function sameToken(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// 只认本机地址：挡住 DNS rebinding（恶意网页把自己的域名解析到 127.0.0.1）
export function hostAllowed(req, port) {
  const host = String(req.headers.host || '').toLowerCase();
  return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`].includes(host);
}
