import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { parseFrontmatter } from '../src/web/frontmatter.mjs';
import { createServer } from '../src/web/server.mjs';
import { PKG_ROOT } from '../src/util.mjs';

const FAKE = path.join(PKG_ROOT, 'test', 'fixtures', 'fake-claude.mjs');
let srv;
let base;
let root;
let home;
let pid;

before(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ai-home-'));
  process.env.CLAUDE_CONFIG_DIR = path.join(home, '.claude');
  process.env.CLAUDE_TASK_HOME = path.join(home, '.claude-task');
  process.env.CLAUDE_TASK_CLAUDE_BIN = FAKE;
  process.env.FAKE_CLAUDE_LOG = path.join(home, 'calls.jsonl');
  fs.chmodSync(FAKE, 0o755);
  // 登录信息写在用户 settings.json 的 env / apiKeyHelper 里（不加载用户设置时也要带上）
  fs.mkdirSync(process.env.CLAUDE_CONFIG_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.CLAUDE_CONFIG_DIR, 'settings.json'), JSON.stringify({
    env: { ANTHROPIC_BASE_URL: 'https://proxy.example.invalid' }, apiKeyHelper: 'echo test-key', hooks: { Stop: [] },
  }));
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ai-proj-')));
  fs.mkdirSync(path.join(root, 'docs', 'tasks'), { recursive: true });
  srv = createServer({ token: 'T', dist: path.join(home, 'no-dist') });
  base = `http://127.0.0.1:${await srv.listen(0)}`;
  await api('POST', '/api/projects', { paths: [root] });
  pid = (await api('GET', '/api/projects')).projects[0].id;
});

after(() => srv.close());

async function api(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: { cookie: 'ct_token=T', 'x-claude-task': '1', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error), { status: res.status, data });
  return data;
}

const B = (id) => `/api/p/${pid}/backlog/${encodeURIComponent(id)}`;
const calls = () => fs.readFileSync(process.env.FAKE_CLAUDE_LOG, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const argAfter = (args, flag) => args[args.indexOf(flag) + 1];
const draft = (title, body = '销售说想导出库存，带筛选') => api('POST', `/api/p/${pid}/backlog`, { title, body });
const list = async () => (await api('GET', `/api/p/${pid}/backlog`)).items;

async function idle(id) {
  for (let i = 0; i < 100; i++) {
    const c = await api('GET', `${B(id)}/chat`);
    if (!c.running && !c.queued) return c;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('一直在整理中');
}

// 先连上 SSE，再触发整理，收集这条草稿的 ai 事件直到 done / error
async function aiEvents(id, action) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  const res = await fetch(`${base}/api/events`, { headers: { cookie: 'ct_token=T' }, signal: ctrl.signal });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  const got = [];
  let buf = '';
  await action();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      for (const p of parts) {
        const m = /^event: ai\ndata: (.*)$/m.exec(p);
        const d = m && JSON.parse(m[1]);
        if (d?.id !== id) continue;
        got.push(d.kind);
        if (d.kind === 'done' || d.kind === 'error') return got;
      }
    }
  } finally {
    clearTimeout(timer);
    ctrl.abort();
  }
  return got;
}

test('AI 整理：只开只读工具、拒读密钥、不加载项目设置，结果写回草稿', async () => {
  const d = await draft('库存导出');
  assert.equal(d.status, 'draft');
  const kinds = await aiEvents(d.id, () => api('POST', `${B(d.id)}/ai`, { useProject: true }));
  assert.deepEqual(kinds, ['start', 'delta', 'tool', 'done']);
  const c = await idle(d.id);
  assert.equal(c.chat.rounds, 1);
  assert.ok(c.chat.sessionId);
  assert.equal(c.chat.questions.length, 2);
  assert.equal(c.chat.messages.at(-1).text, '整理好了，有两个问题要你定。');
  assert.equal(c.item.title, '库存页导出 Excel');
  assert.match(c.item.body, /## 需求分析[\s\S]*## 子任务\n\n- \[ \] 后端导出接口\n- \[ \] 前端导出按钮/);
  const { args, input } = calls().at(-1);
  assert.equal(argAfter(args, '--tools'), 'Read,Grep,Glob');
  assert.equal(argAfter(args, '--setting-sources'), '');
  assert.ok(args.includes('--strict-mcp-config'));
  assert.match(argAfter(args, '--settings'), /Read\(\*\*\/\.env\)/);
  assert.equal(argAfter(args, '--add-dir'), root);
  assert.ok(!args.includes('--resume'));
  assert.equal(calls().at(-1).baseUrl, 'https://proxy.example.invalid');
  const settings = JSON.parse(argAfter(args, '--settings'));
  assert.equal(settings.apiKeyHelper, 'echo test-key');
  assert.equal(settings.hooks, undefined);
  assert.match(input, /销售说想导出库存/);
  const list = await api('GET', `/api/p/${pid}/backlog`);
  assert.equal(list.items.find((i) => i.id === d.id).questions, 2);
});

test('回答问题续聊：接同一个会话，带上回答和当前草稿', async () => {
  const d = (await api('GET', `/api/p/${pid}/backlog`)).items.find((i) => i.status === 'draft');
  const sid = (await api('GET', `${B(d.id)}/chat`)).chat.sessionId;
  await api('POST', `${B(d.id)}/ai`, { answers: [{ q: '价格列要不要导？', a: '只给管理员' }] });
  const c = await idle(d.id);
  const { args, input } = calls().at(-1);
  assert.equal(argAfter(args, '--resume'), sid);
  assert.match(input, /回答：只给管理员/);
  assert.match(input, /当前草稿/);
  assert.equal(c.chat.rounds, 2);
  assert.deepEqual(c.chat.questions, []);
  assert.match(c.item.body, /价格列只给管理员/);
  await assert.rejects(api('POST', `${B(d.id)}/ai`, {}), { status: 400 });
});

test('不参考项目时只给 backlog 目录；格式不对记成错误', async () => {
  const d = await draft('坏格式', 'BADJSON');
  await api('POST', `${B(d.id)}/ai`, { useProject: false });
  const c = await idle(d.id);
  assert.match(c.chat.lastError, /没按格式/);
  assert.equal(argAfter(calls().at(-1).args, '--add-dir'), path.join(root, 'docs', 'backlog'));
  assert.equal(c.item.body, 'BADJSON');
});

test('确认 = 直接上看板：没回答的问题按默认写进正文，转成今天的 task（queued + approved）', async () => {
  const d = await draft('要确认的');
  await api('POST', `${B(d.id)}/ai`, {});
  await idle(d.id);
  const ok = await api('POST', `${B(d.id)}/approve`);
  const [day, num] = [ok.id.slice(0, 10), ok.id.slice(11)];
  const text = fs.readFileSync(path.join(root, 'docs', 'tasks', day, `task-${num}.md`), 'utf8');
  const fm = parseFrontmatter(text).data;
  assert.deepEqual([fm.status, fm.approved, fm.title], ['queued', 'true', '库存页导出 Excel']);
  assert.match(text, /## 待确认（按建议默认处理）\n\n- 价格列要不要导？ → 默认：只给管理员导/);
  assert.equal(text.match(/## 子任务/g).length, 1);
  assert.match(text, /- \[ \] 后端导出接口/);
  await assert.rejects(api('GET', `${B(d.id)}/chat`), { status: 404 });
  const t = (await api('GET', `/api/p/${pid}/tasks`)).tasks.find((x) => x.id === ok.id);
  assert.equal(t.status, 'queued');
});

test('快速添加的草稿不经过 AI 也能直接确认', async () => {
  const d = await api('POST', `/api/p/${pid}/backlog`, { title: '手写的一条' });
  assert.equal(d.status, 'draft');
  const ok = await api('POST', `${B(d.id)}/approve`);
  const text = fs.readFileSync(path.join(root, 'docs', 'tasks', ok.id.slice(0, 10), `task-${ok.id.slice(11)}.md`), 'utf8');
  assert.deepEqual([parseFrontmatter(text).data.status, parseFrontmatter(text).data.approved], ['queued', 'true']);
  assert.doesNotMatch(text, /待确认（按建议默认处理）/);
});

test('没装 claude 时报清楚的错', async () => {
  process.env.CLAUDE_TASK_CLAUDE_BIN = path.join(home, 'no-such-claude');
  try {
    const d = await draft('没有 claude');
    await api('POST', `${B(d.id)}/ai`, {});
    assert.match((await idle(d.id)).chat.lastError, /没找到 claude/);
  } finally {
    process.env.CLAUDE_TASK_CLAUDE_BIN = FAKE;
  }
});

test('整理中不能重复发起，可以停止', async () => {
  const d = await draft('很慢的', 'SLOW');
  await api('POST', `${B(d.id)}/ai`, {});
  assert.equal((await api('GET', `${B(d.id)}/chat`)).running, true);
  await assert.rejects(api('POST', `${B(d.id)}/ai`, {}), { status: 409 });
  await api('POST', `${B(d.id)}/ai/stop`);
  const c = await idle(d.id);
  assert.equal(c.chat.messages.at(-1).text, '已停止');
});

test('批量整理：同时最多 3 条，第 4 条先排队，前面结束后自动开始', async () => {
  const { items } = await api('POST', `/api/p/${pid}/backlog/batch`, { items: [1, 2, 3, 4].map((n) => ({ title: `批量 ${n}`, body: `WAIT ${n}` })) });
  const ids = items.map((i) => i.id);
  const { results } = await api('POST', `/api/p/${pid}/backlog/ai`, { ids, useProject: false });
  assert.deepEqual(results.map((r) => Boolean(r.queued)), [false, false, false, true]);
  const now = await list();
  const st = (id) => now.find((i) => i.id === id);
  assert.deepEqual(ids.map((id) => [st(id).running, st(id).queued]), [[true, false], [true, false], [true, false], [false, true]]);
  for (const id of ids) await idle(id);
  const after = await list();
  assert.deepEqual(ids.map((id) => after.find((i) => i.id === id).rounds), [1, 1, 1, 1]);
  // 第 4 条是最后一个被调起的
  assert.match(calls().at(-1).input, /WAIT 4/);
  // 整理过的不能再批量整理（要去草稿页回答问题或继续对话）
  const again = await api('POST', `/api/p/${pid}/backlog/ai`, { ids: [ids[0]] });
  assert.match(again.results[0].error, /已经整理过了/);
});

test('排队中的可以停止或删除，从队列里移除，不会再被调起', async () => {
  const slow = [];
  for (const n of [1, 2, 3]) slow.push(await draft(`占位 ${n}`, 'SLOW'));
  const a = await draft('排队甲');
  const b = await draft('排队乙');
  const { results } = await api('POST', `/api/p/${pid}/backlog/ai`, { ids: [...slow.map((x) => x.id), a.id, b.id] });
  assert.deepEqual(results.map((r) => Boolean(r.queued)), [false, false, false, true, true]);
  await assert.rejects(api('POST', `${B(a.id)}/approve`), { status: 409 });
  await api('POST', `${B(a.id)}/ai/stop`);
  assert.equal((await api('GET', `${B(a.id)}/chat`)).queued, false);
  await api('DELETE', B(b.id));
  for (const x of slow) await api('POST', `${B(x.id)}/ai/stop`);
  for (const x of slow) await idle(x.id);
  assert.equal((await api('GET', `${B(a.id)}/chat`)).chat, null);
  assert.ok(!calls().some((c) => /排队甲|排队乙/.test(c.input)));
});

test('hook 不再带规划队列，只提醒有几条草稿待确认', async () => {
  const n = (await list()).length;
  assert.ok(n > 0);
  const out = execFileSync('node', [path.join(PKG_ROOT, 'templates', 'hook.mjs'), 'session-start'], {
    input: JSON.stringify({ session_id: 'ai-hook', source: 'startup' }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_TASK_STATE_DIR: path.join(home, 'state') },
    encoding: 'utf8',
  });
  assert.match(out, new RegExp(`规划里有 ${n} 条草稿待确认`));
  assert.doesNotMatch(out, /规划队列/);
});
