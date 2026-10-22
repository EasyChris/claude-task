import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { setFrontmatter, parseFrontmatter } from '../src/web/frontmatter.mjs';
import { createServer } from '../src/web/server.mjs';
import { parseTask } from '../src/web/tasks.mjs';
import { splitDrafts } from '../web/src/draft/split.js';

let srv;
let base;
let root;
let pid;
const day = '2026-05-07';

// 一个旧格式项目：表格版当日索引、没有 frontmatter 的 task 文件、旧命名
before(async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-web-home-'));
  process.env.CLAUDE_CONFIG_DIR = path.join(home, '.claude');
  process.env.CLAUDE_TASK_HOME = path.join(home, '.claude-task');
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-web-proj-')));
  const dir = path.join(root, 'docs', 'tasks', day);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(root, 'docs', 'task-history'));
  fs.writeFileSync(path.join(dir, 'index.md'), `# ${day} 任务索引\n\n| 序号 | 任务 | 状态 | 文件 |\n|---|---|---|---|\n| 1 | 修 bug | 🚧 进行中 | [task-01.md](task-01.md) |\n`);
  fs.writeFileSync(path.join(dir, 'task-01.md'), '# 任务 1: 修 bug\n\n- **状态**: 进行中\n\n- [x] 第一步\n- [ ] 第二步\n\n```\n- [ ] 代码块里的不算\n```\n\n## 总结\n');
  fs.writeFileSync(path.join(dir, 'task-02-old-name.md'), '# 任务 2: 旧命名\n\n- [x] 做完了\n');
  srv = createServer({ token: 'T', dist: path.join(home, 'no-dist') });
  const port = await srv.listen(0);
  base = `http://127.0.0.1:${port}`;
  await api('POST', '/api/projects', { paths: [root] });
  pid = (await api('GET', '/api/projects')).projects[0].id;
});

after(() => srv.close());

async function api(method, url, body, headers = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { cookie: 'ct_token=T', 'x-claude-task': '1', ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error), { status: res.status, data });
  return data;
}

const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');

test('frontmatter 读写保留其余行', () => {
  const t = setFrontmatter('---\na: 1\n# 注释\n---\n正文\n', { b: 'x: y', a: 2 });
  assert.equal(t, '---\na: 2\n# 注释\nb: "x: y"\n---\n正文\n');
  assert.deepEqual(parseFrontmatter(t).data, { a: '2', b: 'x: y' });
});

test('状态推断：勾选框优先于状态行，代码块里的勾选框不算', () => {
  const t = parseTask(read('docs', 'tasks', day, 'task-01.md'), { date: day, num: '01' });
  assert.deepEqual([t.status, t.inferred, t.progress], ['in_progress', true, { done: 1, total: 2 }]);
  assert.equal(parseTask('- [x] a\n', { date: day, num: '02', indexText: '🚧 进行中' }).status, 'done');
});

test('安全：没 cookie / 写操作缺请求头 / Host 不对 都拒绝', async () => {
  assert.equal((await fetch(`${base}/api/projects`)).status, 401);
  const r = await fetch(`${base}/api/projects`, { method: 'POST', headers: { cookie: 'ct_token=T' }, body: '{}' });
  assert.equal(r.status, 403);
  // fetch 不允许改 Host 头，用 http.request 模拟 DNS rebinding
  const status = await new Promise((resolve, reject) => {
    http.get(`${base}/api/projects`, { headers: { host: 'evil.com', cookie: 'ct_token=T' } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).on('error', reject);
  });
  assert.equal(status, 403);
  const login = await fetch(`${base}/p/x/board?token=T`, { redirect: 'manual' });
  assert.equal(login.status, 302);
  assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.equal((await fetch(`${base}/?token=wrong`, { redirect: 'manual' })).status, 403);
});

test('列表、搜索正文、旧命名文件都能读', async () => {
  const { tasks } = await api('GET', `/api/p/${pid}/tasks`);
  assert.deepEqual(tasks.map((t) => t.id).sort(), [`${day}-01`, `${day}-02`]);
  const hit = await api('GET', `/api/p/${pid}/tasks?q=${encodeURIComponent('第二步')}`);
  assert.equal(hit.tasks.length, 1);
  assert.match(hit.tasks[0].snippet, /第二步/);
});

test('勾选：只改那一行；行对不上返回 409', async () => {
  const id = `${day}-01`;
  const t = await api('GET', `/api/p/${pid}/tasks/${id}`);
  const second = t.subtasks.find((s) => s.text === '第二步');
  const after2 = await api('POST', `/api/p/${pid}/tasks/${id}/toggle`, { line: second.line, done: true, text: '第二步' });
  assert.deepEqual(after2.progress, { done: 2, total: 2 });
  assert.match(read('docs', 'tasks', day, 'task-01.md'), /- \[ \] 代码块里的不算/);
  await assert.rejects(api('POST', `/api/p/${pid}/tasks/${id}/toggle`, { line: second.line, done: false, text: '别的' }), { status: 409 });
});

test('改状态：旧文件补 frontmatter，同步当日表格和月度索引', async () => {
  const id = `${day}-01`;
  const t = await api('POST', `/api/p/${pid}/tasks/${id}/status`, { status: 'done' });
  assert.equal(t.inferred, false);
  const fm = parseFrontmatter(read('docs', 'tasks', day, 'task-01.md')).data;
  assert.deepEqual([fm.id, fm.title, fm.status], [id, '修 bug', 'done']);
  assert.match(read('docs', 'tasks', day, 'index.md'), /\| 1 \| 修 bug \| ✅ 已完成 \| \[task-01\.md\]/);
  assert.match(read('docs', 'task-history', '2026-05', 'index.md'), /\| 05-07 \| 修 bug \| ✅ 已完成 \| \[task-01\]\(\.\.\/\.\.\/tasks\/2026-05-07\/task-01\.md\) \|/);
});

test('加子任务进「## 子任务」或最后一个勾选框之后', async () => {
  const t = await api('POST', `/api/p/${pid}/tasks/${day}-02/subtasks`, { text: '新的一步' });
  assert.equal(t.progress.total, 2);
  assert.match(read('docs', 'tasks', day, 'task-02-old-name.md'), /- \[x\] 做完了\n- \[ \] 新的一步/);
});

test('编辑原文：hash 不对返回 409 和最新内容', async () => {
  const id = `${day}-02`;
  const t = await api('GET', `/api/p/${pid}/tasks/${id}`);
  fs.appendFileSync(path.join(root, 'docs', 'tasks', day, 'task-02-old-name.md'), '\nClaude 刚写的\n');
  const e = await api('PUT', `/api/p/${pid}/tasks/${id}/content`, { content: 'x', hash: t.hash }).catch((err) => err);
  assert.equal(e.status, 409);
  assert.match(e.data.current, /Claude 刚写的/);
  const ok = await api('PUT', `/api/p/${pid}/tasks/${id}/content`, { content: `${e.data.current}我的修改\n`, hash: e.data.hash });
  assert.match(ok.content, /Claude 刚写的\n我的修改/);
});

test('贴图：存进 assets 并追加到「## 附件」，只能读 docs 下的图片', async () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const res = await fetch(`${base}/api/p/${pid}/tasks/${day}-01/images`, {
    method: 'POST', headers: { cookie: 'ct_token=T', 'x-claude-task': '1', 'content-type': 'image/png' }, body: png,
  });
  const out = await res.json();
  assert.equal(out.path, 'assets/task-01-1.png');
  assert.match(read('docs', 'tasks', day, 'task-01.md'), /## 附件\n\n!\[截图\]\(assets\/task-01-1\.png\)\n$/);
  const img = await fetch(`${base}/api/p/${pid}/file?path=docs/tasks/${day}/assets/task-01-1.png`, { headers: { cookie: 'ct_token=T' } });
  assert.equal(img.headers.get('content-type'), 'image/png');
  for (const bad of ['../../etc/passwd', 'docs/tasks/../../x.png', 'CLAUDE.md']) {
    const r = await fetch(`${base}/api/p/${pid}/file?path=${encodeURIComponent(bad)}`, { headers: { cookie: 'ct_token=T' } });
    assert.equal(r.status, 403, bad);
  }
});

test('规划：新建是草稿，确认 → 今天的 task 文件 + 图片搬过去 + 规划删除', async () => {
  const a = await api('POST', `/api/p/${pid}/backlog`, { title: '做看板', priority: 'high', body: '要能拖动' });
  const b = await api('POST', `/api/p/${pid}/backlog`, { title: '写文档' });
  assert.deepEqual([a.status, b.status], ['draft', 'draft']);
  const img = await fetch(`${base}/api/p/${pid}/backlog/${encodeURIComponent(a.id)}/images`, {
    method: 'POST', headers: { cookie: 'ct_token=T', 'x-claude-task': '1', 'content-type': 'image/png' }, body: Buffer.from([1]),
  }).then((r) => r.json());
  await api('PUT', `/api/p/${pid}/backlog/${encodeURIComponent(a.id)}`, { body: `要能拖动\n\n![图](${img.path})` });
  const started = await api('POST', `/api/p/${pid}/backlog/${encodeURIComponent(a.id)}/approve`);
  const [d, n] = [started.id.slice(0, 10), started.id.slice(11)];
  const text = read('docs', 'tasks', d, `task-${n}.md`);
  assert.deepEqual([parseFrontmatter(text).data.status, parseFrontmatter(text).data.approved], ['queued', 'true']);
  assert.match(text, /!\[图\]\(assets\/task-\d+-1\.png\)/);
  assert.ok(fs.existsSync(path.join(root, 'docs', 'tasks', d, 'assets', `task-${n}-1.png`)));
  assert.match(read('docs', 'tasks', d, 'index.md'), /做看板 — 📋 排队中/);
  assert.deepEqual((await api('GET', `/api/p/${pid}/backlog`)).items.map((i) => i.title), ['写文档']);
  await api('DELETE', `/api/p/${pid}/backlog/${encodeURIComponent(b.id)}`);
});

test('批量新建：全部校验通过才建；全是草稿', async () => {
  await assert.rejects(api('POST', `/api/p/${pid}/backlog/batch`, { items: [{ title: '好的' }, { title: '  ' }] }), { status: 400 });
  assert.equal((await api('GET', `/api/p/${pid}/backlog`)).items.length, 0);
  const { items } = await api('POST', `/api/p/${pid}/backlog/batch`, { items: [{ title: '甲', body: '甲\n细节' }, { title: '乙' }] });
  assert.deepEqual(items.map((i) => [i.title, i.status]), [['甲', 'draft'], ['乙', 'draft']]);
  for (const i of items) await api('DELETE', `/api/p/${pid}/backlog/${encodeURIComponent(i.id)}`);
});

test('旧数据迁移：approved 的队列条目转成 task 上看板，没 approved 的退回草稿；再跑一次不变', async () => {
  const dir = path.join(root, 'docs', 'backlog');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '90-已确认.md'), '---\ntitle: 已确认的旧条目\nstatus: queued\napproved: true\npriority: high\norder: 1\n---\n\n## 需求分析\n\n旧的\n');
  fs.writeFileSync(path.join(dir, '91-没确认.md'), '---\ntitle: 没确认的旧条目\nstatus: queued\npriority: medium\norder: 2\n---\n\n手写的\n');
  const first = (await api('GET', `/api/p/${pid}/backlog`)).items;
  assert.deepEqual(first.map((i) => [i.title, i.status]), [['没确认的旧条目', 'draft']]);
  assert.ok(!fs.existsSync(path.join(dir, '90-已确认.md')));
  const t = (await api('GET', `/api/p/${pid}/tasks`)).tasks.find((x) => x.title === '已确认的旧条目');
  const fm = parseFrontmatter(read('docs', 'tasks', t.date, `task-${t.num}.md`)).data;
  assert.deepEqual([fm.status, fm.approved, fm.from], ['queued', 'true', 'backlog/90-已确认.md']);
  const tasksBefore = (await api('GET', `/api/p/${pid}/tasks`)).tasks.length;
  const again = (await api('GET', `/api/p/${pid}/backlog`)).items;
  assert.deepEqual(again, first);
  assert.equal((await api('GET', `/api/p/${pid}/tasks`)).tasks.length, tasksBefore);
  await api('DELETE', `/api/p/${pid}/backlog/${encodeURIComponent(first[0].id)}`);
});

test('批量新建拆分：空行分隔；有单独一行 --- 时只按 --- 分；标题取第一行', () => {
  assert.deepEqual(splitDrafts('甲\n细节\n\n\n# 乙\n'), [{ title: '甲', body: '甲\n细节' }, { title: '乙', body: '# 乙' }]);
  assert.deepEqual(splitDrafts('甲\n\n甲的第二段\n---\n乙\n  ---  \n\n').map((x) => x.title), ['甲', '乙']);
  assert.equal(splitDrafts('甲\n\n甲的第二段\n---\n乙')[0].body, '甲\n\n甲的第二段');
  assert.deepEqual(splitDrafts('  \n\n '), []);
});

test('扫描目录只读，能找到项目，旧版工作流标出需要迁移', async () => {
  const md = path.join(root, 'CLAUDE.md');
  fs.writeFileSync(md, '## ⚡ 会话开始流程\n\n1. 读记忆\n');
  try {
    const before2 = fs.readdirSync(root).sort();
    const out = await api('GET', `/api/scan?dir=${encodeURIComponent(path.dirname(root))}`);
    const me = out.projects.find((p) => p.path === root);
    assert.equal(me.registered, true);
    assert.equal(me.kind, 'split'); // 有 docs/task-history 的旧流程
    assert.equal(me.migrate, true);
    assert.equal((await api('GET', '/api/projects')).projects[0].migrate, true);
    assert.deepEqual(fs.readdirSync(root).sort(), before2);
  } finally {
    fs.rmSync(md);
  }
});
