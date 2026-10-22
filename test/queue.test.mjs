import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { init } from '../src/init.mjs';
import { update } from '../src/update.mjs';
import { PKG_ROOT } from '../src/util.mjs';
import { parseFrontmatter } from '../src/web/frontmatter.mjs';
import { createServer } from '../src/web/server.mjs';

let home;
let root;
let srv;
let base;
let pid;

const fm = (...p) => parseFrontmatter(fs.readFileSync(path.join(root, ...p), 'utf8')).data;
const exists = (...p) => fs.existsSync(path.join(root, ...p));

// 两个日期目录里各放几个带 frontmatter 的 task，执行队列跨日期
function writeTask(day, num, fields, body = '') {
  const dir = path.join(root, 'docs', 'tasks', day);
  fs.mkdirSync(dir, { recursive: true });
  const head = Object.entries({ id: `${day}-${num}`, ...fields }).map(([k, v]) => `${k}: ${v}`).join('\n');
  fs.writeFileSync(path.join(dir, `task-${num}.md`), `---\n${head}\n---\n\n# 任务 ${Number(num)}: ${fields.title}\n${body}`);
}

function seed() {
  fs.rmSync(path.join(root, 'docs'), { recursive: true, force: true });
  writeTask('2026-10-20', '01', { title: '旧的排第二', status: 'queued', run_order: 2 });
  writeTask('2026-10-21', '01', { title: '排第一', status: 'queued', approved: true, run_order: 1 }, '\n## 子任务\n\n- [ ] 做\n');
  writeTask('2026-10-21', '02', { title: '没排队', status: 'planning' });
  writeTask('2026-10-21', '03', { title: '做着的', status: 'in_progress' });
  writeTask('2026-10-21', '04', { title: '做完还留着序号', status: 'done', run_order: 3 });
}

before(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-q-home-'));
  process.env.CLAUDE_CONFIG_DIR = path.join(home, '.claude');
  process.env.CLAUDE_TASK_HOME = path.join(home, '.claude-task');
  process.env.CLAUDE_TASK_MANAGED_DIR = path.join(home, 'managed');
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-q-proj-')));
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# 测试\n'); // 登记项目要求有 CLAUDE.md 或 docs/tasks；每个用例会重建 docs
  srv =createServer({ token: 'T', dist: path.join(home, 'no-dist') });
  base = `http://127.0.0.1:${await srv.listen(0)}`;
  await api('POST', '/api/projects', { paths: [root] });
  pid = (await api('GET', '/api/projects')).projects[0].id;
});

after(() => srv.close());
beforeEach(seed);

async function api(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: { cookie: 'ct_token=T', 'x-claude-task': '1', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error), { status: res.status });
  return data;
}

const queue = (ids) => api('POST', `/api/p/${pid}/queue`, { ids });
const order = (tasks) => tasks.filter((t) => t.runOrder).sort((a, b) => a.runOrder - b.runOrder).map((t) => t.id);

test('列表带 runOrder；总览的执行队列数不算已完成的残留序号', async () => {
  const { tasks } = await api('GET', `/api/p/${pid}/tasks`);
  assert.equal(tasks.find((t) => t.id === '2026-10-21-01').runOrder, 1);
  assert.equal(tasks.find((t) => t.id === '2026-10-21-02').runOrder, null);
  const p = (await api('GET', '/api/projects')).projects[0];
  assert.equal(p.counts.queue, 2);
});

test('排序接口：按 id 列表重排成 1..n，不在列表里的去掉 run_order，正文不动', async () => {
  const before = fs.readFileSync(path.join(root, 'docs/tasks/2026-10-21/task-01.md'), 'utf8');
  // 拖进来插到中间：2026-10-21-02 落在第 2 位；残留在已完成上的 run_order 也一起清掉
  const { tasks } = await queue(['2026-10-20-01', '2026-10-21-02', '2026-10-21-01']);
  assert.deepEqual(order(tasks), ['2026-10-20-01', '2026-10-21-02', '2026-10-21-01']);
  assert.equal(fm('docs/tasks/2026-10-21/task-02.md').run_order, '2');
  assert.equal(fm('docs/tasks/2026-10-21/task-02.md').status, 'planning'); // 待开始的状态不改
  assert.equal(fm('docs/tasks/2026-10-21/task-04.md').run_order, undefined);
  const after = fs.readFileSync(path.join(root, 'docs/tasks/2026-10-21/task-01.md'), 'utf8');
  assert.equal(after, before.replace('run_order: 1', 'run_order: 3'));
  // 拖回待开始 = 从列表里去掉
  await queue(['2026-10-21-01']);
  assert.equal(fm('docs/tasks/2026-10-20/task-01.md').run_order, undefined);
  assert.equal(fm('docs/tasks/2026-10-21/task-01.md').run_order, '1');
});

test('排序接口：进行中的拖进队列改回 queued；id 不对或重复什么都不写', async () => {
  await queue(['2026-10-21-03', '2026-10-21-01']);
  assert.deepEqual([fm('docs/tasks/2026-10-21/task-03.md').status, fm('docs/tasks/2026-10-21/task-03.md').run_order], ['queued', '1']);
  await assert.rejects(queue(['2026-10-21-01', '2026-10-21-01']), { status: 400 });
  await assert.rejects(queue(['2026-10-21-01', '2026-01-01-09']), { status: 404 });
  assert.equal(fm('docs/tasks/2026-10-21/task-01.md').run_order, '2');
});

test('拖到进行中 / 已完成：只改状态并去掉 run_order；拖到待开始的状态不去掉', async () => {
  await api('POST', `/api/p/${pid}/tasks/2026-10-21-01/status`, { status: 'in_progress' });
  assert.deepEqual([fm('docs/tasks/2026-10-21/task-01.md').status, fm('docs/tasks/2026-10-21/task-01.md').run_order], ['in_progress', undefined]);
  await api('POST', `/api/p/${pid}/tasks/2026-10-20-01/status`, { status: 'done' });
  assert.equal(fm('docs/tasks/2026-10-20/task-01.md').run_order, undefined);
  await queue(['2026-10-21-02']);
  await api('POST', `/api/p/${pid}/tasks/2026-10-21-02/status`, { status: 'awaiting_approval' });
  assert.equal(fm('docs/tasks/2026-10-21/task-02.md').run_order, '1');
});

const hook = path.join(PKG_ROOT, 'templates', 'hook.mjs');
const run = (args, input) => execFileSync('node', [hook, ...args], {
  cwd: root, input, encoding: 'utf8',
  env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_TASK_STATE_DIR: path.join(home, 'state') },
});

test('hook queue 子命令：进行中 + 跨日期按 run_order 的执行队列，不读 stdin', () => {
  const out = execFileSync('node', [hook, 'queue'], { cwd: root, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: '' }, stdio: ['inherit', 'pipe', 'pipe'] });
  assert.match(out, /## 进行中（1 条）\n- 2026-10-21-03《做着的》 docs\/tasks\/2026-10-21\/task-03\.md/);
  assert.match(out, /## 执行队列（2 条）\n1\. 2026-10-21-01《排第一》 · run_order: 1 · approved: true（计划已确认） · docs\/tasks\/2026-10-21\/task-01\.md\n2\. 2026-10-20-01《旧的排第二》 · run_order: 2 · 未 approved/);
  assert.doesNotMatch(out, /做完还留着序号|没排队/);
  fs.rmSync(path.join(root, 'docs'), { recursive: true });
  assert.match(run(['queue']), /## 进行中（0 条）\n（没有）[\s\S]*## 执行队列（0 条）\n（空）/);
});

test('hook session-start：执行队列和进行中各提一句，空的时候不提', () => {
  const out = run(['session-start'], JSON.stringify({ session_id: 'q1', source: 'startup' }));
  assert.match(out, /执行队列有 2 条，第 1 条是《排第一》，输入 \/next 开始。/);
  assert.match(out, /有 1 条任务在进行中：《做着的》（2026-10-21-03）。/);
  fs.rmSync(path.join(root, 'docs', 'tasks'), { recursive: true });
  const empty = run(['session-start'], JSON.stringify({ session_id: 'q2', source: 'startup' }));
  assert.doesNotMatch(empty, /执行队列有|在进行中：/);
});

test('init / update / --no-hooks / --hooks：next.md 和队列脚本跟着 hooks 装和删', async () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-q-init-'));
  const has = (...p) => fs.existsSync(path.join(proj, ...p));
  await init(proj, { yes: true, name: 'Easy' });
  const next = fs.readFileSync(path.join(proj, '.claude', 'commands', 'next.md'), 'utf8');
  assert.match(next, /^---\ndescription: .+\nallowed-tools: Bash\(node \.claude\/hooks\/claude-task\.mjs queue\)\n---/);
  assert.match(next, /!`node \.claude\/hooks\/claude-task\.mjs queue`/);
  assert.match(next, /Easy/);
  assert.doesNotMatch(next, /\{\{/);
  assert.ok(has('.claude', 'hooks', 'claude-task-queue.mjs'));
  // 已安装的 hook 能跑 queue（装进项目后靠同目录的 claude-task-queue.mjs）
  assert.match(execFileSync('node', ['.claude/hooks/claude-task.mjs', 'queue'], { cwd: proj, encoding: 'utf8' }), /执行队列（0 条）/);

  fs.writeFileSync(path.join(proj, '.claude', 'commands', 'next.md'), '旧版本');
  update(proj, {});
  assert.equal(fs.readFileSync(path.join(proj, '.claude', 'commands', 'next.md'), 'utf8'), next);

  update(proj, { hooks: false });
  assert.ok(!has('.claude', 'commands', 'next.md'));
  assert.ok(!has('.claude', 'hooks', 'claude-task-queue.mjs'));
  assert.doesNotMatch(fs.readFileSync(path.join(proj, 'CLAUDE.md'), 'utf8'), /\/next/);
  update(proj, { hooks: true });
  assert.ok(has('.claude', 'commands', 'next.md'));
  assert.match(fs.readFileSync(path.join(proj, 'CLAUDE.md'), 'utf8'), /输入 `\/next` 一次做一条/);
  fs.rmSync(proj, { recursive: true });
});
