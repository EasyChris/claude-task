// 调本机的 claude -p（无头模式）：提示词走 stdin，逐行解析 stream-json，把进度交给 onEvent
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { claudeConfigDir } from '../../../templates/claude-task-memdir.mjs';

const TIMEOUT = 6 * 60 * 1000;
export const claudeBin = () => process.env.CLAUDE_TASK_CLAUDE_BIN || 'claude';

// 调用时不加载用户设置（免得跑用户自己的 hooks），但登录方式可能写在 ~/.claude/settings.json 的
// env（ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL 等）或 apiKeyHelper 里，要单独带上，否则会 Not logged in
export function userAuth() {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(claudeConfigDir(), 'settings.json'), 'utf8'));
    const env = Object.fromEntries(Object.entries(s.env || {}).filter(([, v]) => typeof v === 'string'));
    return { env, apiKeyHelper: typeof s.apiKeyHelper === 'string' ? s.apiKeyHelper : undefined };
  } catch {
    return { env: {} };
  }
}

function relay(msg, onEvent) {
  if (msg.type === 'stream_event') {
    const e = msg.event || {};
    if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta') onEvent({ kind: 'delta', text: e.delta.text });
  } else if (msg.type === 'assistant') {
    for (const c of msg.message?.content || []) {
      if (c.type === 'tool_use') {
        onEvent({ kind: 'tool', name: c.name, target: String(c.input?.file_path || c.input?.pattern || c.input?.path || '') });
      }
    }
  }
}

// 返回 { promise, stop }；promise 一定 resolve：{ result, sessionId } / { error } / { stopped }
export function runClaude({ args, input, cwd, env = {}, onEvent = () => {}, timeoutMs = TIMEOUT }) {
  let child = null;
  let stopped = null;
  const promise = new Promise((resolve) => {
    let settled = false;
    let buf = '';
    let stderr = '';
    let result = null;
    let sessionId = null;
    const done = (r) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => {
      stopped = 'timeout';
      child?.kill('SIGTERM');
    }, timeoutMs);
    try {
      child = spawn(claudeBin(), args, { cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      return done({ error: e.message });
    }
    child.on('error', (e) => done({
      error: e.code === 'ENOENT' ? '没找到 claude 命令：先安装 Claude Code 并登录（终端里能运行 claude）' : e.message,
    }));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => {
      buf += d;
      for (let k = buf.indexOf('\n'); k >= 0; k = buf.indexOf('\n')) {
        const line = buf.slice(0, k).trim();
        buf = buf.slice(k + 1);
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.session_id) sessionId = msg.session_id;
        if (msg.type === 'result') result = msg;
        relay(msg, onEvent);
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d) => {
      stderr = (stderr + d).slice(-4000);
    });
    child.on('close', (code) => {
      if (stopped === 'user') return done({ stopped: true, sessionId });
      if (stopped === 'timeout') return done({ error: `整理超时（${Math.round(timeoutMs / 60000)} 分钟），已停止`, sessionId });
      if (result && !result.is_error) return done({ result, sessionId });
      const why = (result?.is_error && String(result.result || '')) || stderr.trim().split('\n').pop() || `claude 异常退出（${code}）`;
      done({ error: /not logged in/i.test(why) ? '没登录 Claude Code：终端里运行 claude 再 /login，或在 ~/.claude/settings.json 的 env 里配好 ANTHROPIC_* 变量' : why, sessionId });
    });
  });
  return {
    promise,
    stop() {
      stopped = 'user';
      child?.kill('SIGTERM');
    },
  };
}
