// `claude-task web`：已经有服务在跑就直接打开浏览器，否则启动一个新的
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { claudeTaskHome, resolveRoot, tildify } from '../util.mjs';
import { readProjects } from './projects.mjs';
import { createServer } from './server.mjs';

const stateFile = () => path.join(claudeTaskHome(), 'server.json');

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch {
    return null;
  }
}

async function alive(state) {
  try {
    const res = await fetch(`http://127.0.0.1:${state.port}/api/ping`, {
      headers: { cookie: `ct_token=${state.token}` },
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function openBrowser(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch {}
}

// 在已登记的项目目录里运行，就直接打开这个项目的看板
function startPath(cwd) {
  try {
    const root = resolveRoot(cwd);
    const p = readProjects().find((x) => x.path === root);
    return p ? `/p/${encodeURIComponent(p.id)}/board` : '/';
  } catch {
    return '/';
  }
}

export async function runWeb({ port, open = true, cwd = process.cwd() } = {}) {
  const page = startPath(cwd);
  const prev = readState();
  if (prev && (await alive(prev))) {
    const url = `http://127.0.0.1:${prev.port}${page}?token=${prev.token}`;
    console.log(`claude-task web 已经在运行（pid ${prev.pid}），直接打开：\n  ${url}`);
    if (open) openBrowser(url);
    return null;
  }

  const srv = createServer();
  const actual = await srv.listen(port ?? 7432);
  fs.mkdirSync(claudeTaskHome(), { recursive: true });
  fs.writeFileSync(stateFile(), JSON.stringify({ port: actual, token: srv.token, pid: process.pid }) + '\n', { mode: 0o600 });

  const url = `http://127.0.0.1:${actual}${page}?token=${srv.token}`;
  console.log(`claude-task web 已启动（只监听本机）：\n  ${url}\n`);
  console.log(`项目列表：${tildify(path.join(claudeTaskHome(), 'projects.json'))}`);
  console.log('按 Ctrl+C 停止。');
  if (open) openBrowser(url);

  const stop = async () => {
    if (readState()?.pid === process.pid) fs.rmSync(stateFile(), { force: true });
    await srv.close();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return srv;
}
