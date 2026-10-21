import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createServer } from '../src/web/server.mjs';
import { PKG_ROOT, projectSlug } from '../src/util.mjs';

const S1 = '11111111-1111-4111-8111-111111111111'; // 用 Edit 改过 task-01
const S2 = '22222222-2222-4222-8222-222222222222'; // 记在 task-02 的 frontmatter 里
const S3 = '33333333-3333-4333-8333-333333333333'; // 只读过 task-01，不算关联
let srv;
let base;
let root;
let home;
let pid;
let tdir;

const line = (o) => `${JSON.stringify({ timestamp: '2026-10-21T08:00:00.000Z', ...o })}\n`;
const user = (content, extra = {}) => line({ type: 'user', message: { role: 'user', content }, ...extra });
const asst = (content, extra = {}) => line({ type: 'assistant', message: { id: 'm1', role: 'assistant', content }, ...extra });

before(async () => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-tr-home-'));
  process.env.CLAUDE_CONFIG_DIR = path.join(home, '.claude');
  process.env.CLAUDE_TASK_HOME = path.join(home, '.claude-task');
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-tr-proj-')));
  const day = path.join(root, 'docs', 'tasks', '2026-10-21');
  fs.mkdirSync(day, { recursive: true });
  fs.writeFileSync(path.join(day, 'task-01.md'), '---\nid: 2026-10-21-01\ntitle: 任务一\nstatus: in_progress\n---\n# 任务 1: 任务一\n');
  fs.writeFileSync(path.join(day, 'task-02.md'), `---\nid: 2026-10-21-02\ntitle: 任务二\nstatus: in_progress\nsessions: ${S2}\n---\n# 任务 2: 任务二\n`);
  tdir = path.join(home, '.claude', 'projects', projectSlug(root));
  fs.mkdirSync(tdir, { recursive: true });
  const t1 = `${root}/docs/tasks/2026-10-21/task-01.md`;
  fs.writeFileSync(path.join(tdir, `${S1}.jsonl`), [
    user('<command-name>/init</command-name><command-args>--yes</command-args>'),
    user('注入的内容', { isMeta: true }),
    user('帮我改任务一\n<system-reminder>不该显示</system-reminder>'),
    asst([{ type: 'thinking', thinking: '先想一想' }]),
    asst([{ type: 'text', text: '好的，我来改。' }]),
    asst([{ type: 'tool_use', id: 'tu1', name: 'Edit', input: { file_path: t1, old_string: 'a', new_string: 'b' } }]),
    user([{ type: 'tool_result', tool_use_id: 'tu1', content: '改好了' }]),
    asst([{ type: 'text', text: '子代理说的话' }], { isSidechain: true }),
    '这一行不是 JSON\n',
  ].join(''));
  fs.writeFileSync(path.join(tdir, `${S2}.jsonl`), user('做任务二'));
  fs.writeFileSync(path.join(tdir, `${S3}.jsonl`), [
    user('看看任务一'),
    asst([{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: t1 } }]),
    asst([{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: `cat ${t1} 2>/dev/null` } }]),
  ].join(''));
  srv = createServer({ token: 'T', dist: path.join(home, 'no-dist') });
  base = `http://127.0.0.1:${await srv.listen(0)}`;
  await api('/api/projects', { paths: [root] });
  pid = (await api('/api/projects')).projects[0].id;
});

after(() => srv.close());

async function api(url, body) {
  const res = await fetch(base + url, {
    method: body ? 'POST' : 'GET',
    headers: { cookie: 'ct_token=T', 'x-claude-task': '1', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error), { status: res.status });
  return data;
}

test('会话原文整理成条目：命令、用户消息去掉系统提醒、思考、工具和结果；跳过注入、子代理和坏行', async () => {
  const r = await api(`/api/p/${pid}/transcripts/${S1}`);
  assert.deepEqual(r.items.map((i) => i.k), ['command', 'user', 'thinking', 'text', 'tool', 'result']);
  assert.equal(r.items[0].text, '/init --yes');
  assert.equal(r.items[1].text, '帮我改任务一');
  const tool = r.items[4];
  assert.deepEqual([tool.name, tool.summary, tool.id], ['Edit', 'docs/tasks/2026-10-21/task-01.md', 'tu1']);
  assert.deepEqual([r.items[5].id, r.items[5].text, r.items[5].error], ['tu1', '改好了', false]);
  assert.equal(r.live, true);
  assert.doesNotMatch(JSON.stringify(r), /不该显示|子代理/);
});

test('从上次的位置接着读，只返回新增的完整行，正在写的半行留到下次', async () => {
  const first = await api(`/api/p/${pid}/transcripts/${S1}`);
  fs.appendFileSync(path.join(tdir, `${S1}.jsonl`), `${asst([{ type: 'text', text: '新的一句' }])}{"type":"assistant","mess`);
  const r = await api(`/api/p/${pid}/transcripts/${S1}?from=${first.next}`);
  assert.deepEqual(r.items.map((i) => i.text), ['新的一句']);
  const again = await api(`/api/p/${pid}/transcripts/${S1}?from=${r.next}`);
  assert.deepEqual(again.items, []);
  assert.equal(again.next, r.next);
});

test('任务关联会话：改过 task 文件的和 frontmatter 记录的算，只读过的不算', async () => {
  const one = await api(`/api/p/${pid}/tasks/2026-10-21-01/conversations`);
  assert.deepEqual(one.sessions.map((s) => [s.id, s.how]), [[S1, 'edit']]);
  assert.equal(one.sessions[0].first, '帮我改任务一');
  const two = await api(`/api/p/${pid}/tasks/2026-10-21-02/conversations`);
  assert.deepEqual(two.sessions.map((s) => [s.id, s.how]), [[S2, 'record']]);
});

test('会话 id 格式不对拒绝，不存在的会话 404', async () => {
  await assert.rejects(api(`/api/p/${pid}/transcripts/..%2F..%2Fetc`), { status: 400 });
  await assert.rejects(api(`/api/p/${pid}/transcripts/44444444-4444-4444-8444-444444444444`), { status: 404 });
});

test('hook 在会话开始时告诉 Claude 本次会话 id', () => {
  const out = execFileSync('node', [path.join(PKG_ROOT, 'templates', 'hook.mjs'), 'session-start'], {
    input: JSON.stringify({ session_id: S3, source: 'startup' }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_TASK_STATE_DIR: path.join(home, 'state') },
    encoding: 'utf8',
  });
  assert.match(out, new RegExp(`本次会话 id：${S3}`));
  assert.match(out, /sessions 字段/);
});
