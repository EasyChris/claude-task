// 本地 Web 服务：只监听 127.0.0.1，网址带 token 换 cookie，写操作要求自定义请求头
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { PKG_ROOT } from '../util.mjs';
import { stopAll } from './ai/drafts.mjs';
import { HttpError } from './fsutil.mjs';
import { COOKIE, hostAllowed, parseCookies, read, sameToken, sendFile, sendJSON, sendStatic } from './httputil.mjs';
import { readProjects } from './projects.mjs';
import { handleApi } from './routes.mjs';
import { Watcher } from './watch.mjs';

export const DIST = path.join(PKG_ROOT, 'web', 'dist');
const KEEPALIVE = 25000;

export function createServer({ token = crypto.randomBytes(24).toString('base64url'), dist = DIST } = {}) {
  const clients = new Set();
  let port = 0;

  const broadcast = (event, data) => {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(msg);
  };
  const watcher = new Watcher((id) => broadcast('change', { project: id }));
  const ctx = {
    broadcast,
    refreshWatch() {
      try {
        watcher.sync(readProjects());
      } catch {}
      broadcast('projects', {});
    },
  };

  function openEvents(req, res) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    clients.add(res);
    const timer = setInterval(() => res.write(': ping\n\n'), KEEPALIVE);
    req.on('close', () => {
      clearInterval(timer);
      clients.delete(res);
    });
  }

  async function handle(req, res) {
    if (!hostAllowed(req, port)) throw new HttpError(403, '只允许通过 127.0.0.1 / localhost 访问');
    const url = new URL(req.url, 'http://127.0.0.1');
    const isApi = url.pathname.startsWith('/api/');

    // 终端里打印的网址带 ?token=，第一次打开时换成 HttpOnly cookie，再跳到不带 token 的网址
    const qToken = url.searchParams.get('token');
    if (qToken && !isApi && req.method === 'GET') {
      if (!sameToken(qToken, token)) throw new HttpError(403, 'token 不对：请用终端里 npx claude-task web 打印的网址打开');
      url.searchParams.delete('token');
      res.writeHead(302, {
        'Set-Cookie': `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`,
        Location: url.pathname + url.search,
        'Cache-Control': 'no-store',
      });
      return res.end();
    }
    if (!isApi) return sendStatic(res, dist, url.pathname); // 页面本身不含数据，数据都走下面带校验的接口

    if (!sameToken(parseCookies(req)[COOKIE], token)) throw new HttpError(401, '没有登录：请在终端运行 npx claude-task web 重新打开');
    // 跨站页面不能在不触发预检的情况下带自定义请求头，而我们不响应 CORS 预检
    if (req.method !== 'GET' && req.headers['x-claude-task'] !== '1') throw new HttpError(403, '缺少 X-Claude-Task 请求头');
    if (url.pathname === '/api/ping') return sendJSON(res, 200, { ok: true, pid: process.pid });
    if (url.pathname === '/api/events') return openEvents(req, res);
    const out = await handleApi(req, url, ctx, read);
    if (out?.__file) return sendFile(res, out.__file);
    return sendJSON(res, 200, out);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      if (res.headersSent) return res.end();
      sendJSON(res, status, { error: status === 500 ? `服务出错：${e.message}` : e.message, ...(e.data || {}) });
    });
  });

  function listenOnce(p) {
    return new Promise((resolve, reject) => {
      const onError = (e) => {
        server.off('listening', onListening);
        reject(e);
      };
      const onListening = () => {
        server.off('error', onError);
        resolve(server.address().port);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(p, '127.0.0.1');
    });
  }

  return {
    token,
    get port() {
      return port;
    },
    // 端口被占用就往后试几个；p=0 让系统分配（测试用）
    async listen(p = 7432, tries = 10) {
      for (let k = 0; ; k++) {
        try {
          port = await listenOnce(p === 0 ? 0 : p + k);
          break;
        } catch (e) {
          if (e.code !== 'EADDRINUSE' || p === 0 || k >= tries - 1) throw e;
        }
      }
      ctx.refreshWatch();
      watcher.watchRegistry(() => ctx.refreshWatch());
      return port;
    },
    close() {
      stopAll();
      watcher.close();
      for (const res of clients) res.end();
      clients.clear();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
