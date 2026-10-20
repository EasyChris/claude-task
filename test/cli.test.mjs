import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, test } from 'node:test';
import { init } from '../src/init.mjs';
import { mergeHooks } from '../src/settings.mjs';
import { update } from '../src/update.mjs';
import { PKG_ROOT, localDate, projectSlug } from '../src/util.mjs';

let root;
let home;

// 每个用例一个干净的项目目录 + 假的 ~/.claude 和 ~/.claude-task，不碰真实家目录
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-home-'));
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-proj-'));
  process.env.CLAUDE_CONFIG_DIR = path.join(home, '.claude');
  process.env.CLAUDE_TASK_HOME = path.join(home, '.claude-task');
});

const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const exists = (...p) => fs.existsSync(path.join(root, ...p));
// root 故意不解析软链接（macOS 的 tmpdir 在 /var 下），验证 CLI 和 hook 都按真实路径算
const memDir = () => path.join(home, '.claude', 'projects', projectSlug(fs.realpathSync(root)), 'memory');
const opts = { yes: true, name: 'Easy', intro: '测试项目', features: '抓取, 报价；看板' };

test('projectSlug 与 Claude Code 的目录命名一致', () => {
  assert.equal(projectSlug('/Users/alice/code/my-app'), '-Users-alice-code-my-app');
  assert.equal(projectSlug('/a/kiro.rs/b_c'), '-a-kiro-rs-b-c');
});

test('init 在空项目里生成全部文件', async () => {
  await init(root, opts);
  const { day, month } = localDate();
  const md = read('CLAUDE.md');
  assert.match(md, /## 项目介绍\n\n测试项目/);
  assert.match(md, /- 抓取\n- 报价\n- 看板/);
  assert.match(md, /称呼 Easy/);
  assert.match(md, /claude-task:start v\d/);
  assert.match(md, /已装 hooks/);
  assert.match(md, /源码文件不超过 200 行/);
  assert.doesNotMatch(md, /\{\{/);
  assert.ok(exists('docs', 'tasks', day, 'index.md'));
  assert.ok(exists('docs', 'task-history', month, 'index.md'));
  assert.match(read('docs', 'task-history', 'README.md'), /等 Easy 确认/);
  assert.ok(exists('.claude', 'hooks', 'claude-task.mjs'));
  assert.match(fs.readFileSync(path.join(memDir(), 'MEMORY.md'), 'utf8'), /\]\(sessions\//);
  assert.ok(fs.existsSync(path.join(memDir(), 'sessions')));
  const settings = JSON.parse(read('.claude', 'settings.json'));
  assert.equal(settings.hooks.SessionStart.length, 1);
  assert.equal(settings.hooks.UserPromptSubmit.length, 1);
  const reg = JSON.parse(fs.readFileSync(path.join(home, '.claude-task', 'projects.json'), 'utf8'));
  assert.deepEqual(reg.projects.map((p) => p.path), [fs.realpathSync(root)]);
});

test('已有普通 CLAUDE.md：原内容保留，流程块追加在后面', async () => {
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# 我的项目\n\n自己写的规则\n');
  await init(root, opts);
  const md = read('CLAUDE.md');
  assert.ok(md.startsWith('# 我的项目\n\n自己写的规则\n\n<!-- claude-task:start'));
  assert.doesNotMatch(md, /## 项目介绍/);
});

test('旧版工作流的 CLAUDE.md 拒绝 init，并且什么都不写', async () => {
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '## ⚡ 会话开始流程\n旧内容\n');
  await assert.rejects(init(root, opts), /migrate/);
  assert.deepEqual(fs.readdirSync(root), ['CLAUDE.md']);
});

test('update 只换流程块，块外内容不动，重复执行无改动', async () => {
  await init(root, opts);
  const file = path.join(root, 'CLAUDE.md');
  const edited = read('CLAUDE.md')
    .replace('测试项目', '我改过的介绍')
    .replace('称呼 Easy', '称呼 被手改了');
  fs.writeFileSync(file, edited + '\n## 块后面的自定义\n');
  update(root, { name: 'Chris' });
  const md = read('CLAUDE.md');
  assert.match(md, /我改过的介绍/);
  assert.match(md, /## 块后面的自定义/);
  assert.match(md, /称呼 Chris/);
  assert.doesNotMatch(md, /被手改了/);
  assert.match(read('docs', 'task-history', 'README.md'), /等 Chris 确认/);
  const second = update(root, {});
  assert.ok(second.writer.log.every((e) => e.status === 'unchanged'), second.writer.summary());
});

test('README 去掉 managed 标记后 update 不再覆盖', async () => {
  await init(root, opts);
  const file = path.join(root, 'docs', 'task-history', 'README.md');
  fs.writeFileSync(file, '# 我自己的规范\n');
  update(root, {});
  assert.equal(fs.readFileSync(file, 'utf8'), '# 我自己的规范\n');
});

test('--no-hooks 时 update 删掉 hook 脚本和 settings 条目，保留别人的 hooks', async () => {
  fs.mkdirSync(path.join(root, '.claude'));
  const other = { type: 'command', command: 'echo hi' };
  fs.writeFileSync(path.join(root, '.claude', 'settings.json'), JSON.stringify({
    permissions: { allow: ['Bash(ls)'] },
    hooks: { SessionStart: [{ hooks: [other] }] },
  }));
  await init(root, opts);
  let s = JSON.parse(read('.claude', 'settings.json'));
  assert.equal(s.hooks.SessionStart.length, 2);
  update(root, { hooks: false });
  s = JSON.parse(read('.claude', 'settings.json'));
  assert.deepEqual(s, { permissions: { allow: ['Bash(ls)'] }, hooks: { SessionStart: [{ hooks: [other] }] } });
  assert.ok(!exists('.claude', 'hooks', 'claude-task.mjs'));
  assert.doesNotMatch(read('CLAUDE.md'), /已装 hooks/);
});

test('mergeHooks 幂等', () => {
  const once = mergeHooks({}, true);
  assert.deepEqual(mergeHooks(once, true), once);
});

test('坏掉的 settings.json：报错且不写任何文件', async () => {
  fs.mkdirSync(path.join(root, '.claude'));
  fs.writeFileSync(path.join(root, '.claude', 'settings.json'), '{ 坏的');
  await assert.rejects(init(root, opts), /不是合法 JSON/);
  assert.deepEqual(fs.readdirSync(path.join(root, '.claude')), ['settings.json']);
});

test('--dry-run 不写任何文件', async () => {
  const { writer } = await init(root, { ...opts, dryRun: true });
  assert.ok(writer.log.some((e) => e.status === 'created'));
  assert.deepEqual(fs.readdirSync(root), []);
  assert.ok(!fs.existsSync(home + '/.claude'));
});

test('--memory repo 写到仓库并忽略 sessions', async () => {
  await init(root, { ...opts, memory: 'repo' });
  assert.ok(exists('.ai', 'memory', 'MEMORY.md'));
  assert.match(read('.gitignore'), /^\.ai\/memory\/sessions\/$/m);
  assert.match(read('CLAUDE.md'), /记忆目录：`\.ai\/memory\/`/);
});

function runHook(mode, input, env = {}) {
  return execFileSync('node', [path.join(PKG_ROOT, 'templates', 'hook.mjs'), mode], {
    input: JSON.stringify(input),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_TASK_STATE_DIR: path.join(home, 'state'), ...env },
    encoding: 'utf8',
  });
}

test('hook session-start 注入记忆与最近会话，并建好今日目录', async () => {
  await init(root, opts);
  const { day } = localDate();
  fs.rmSync(path.join(root, 'docs', 'tasks', day), { recursive: true });
  fs.writeFileSync(path.join(memDir(), 'sessions', '2026-10-19-01.md'), '# Session 旧');
  fs.writeFileSync(path.join(memDir(), 'sessions', '2026-10-20-01.md'), '# Session 最新');
  fs.utimesSync(path.join(memDir(), 'sessions', '2026-10-19-01.md'), new Date(0), new Date(0));
  const out = runHook('session-start', { session_id: 's1', source: 'startup' });
  assert.match(out, /\[claude-task\] 今天是/);
  assert.match(out, /\]\(sessions\//);
  assert.match(out, /# Session 最新/);
  assert.doesNotMatch(out, /# Session 旧/);
  assert.ok(exists('docs', 'tasks', day, 'index.md'));
  assert.match(runHook('session-start', { session_id: 's1', source: 'compact' }), /上下文刚被压缩/);
});

test('hook user-prompt-submit 到时间才提醒', async () => {
  await init(root, opts);
  assert.equal(runHook('user-prompt-submit', { session_id: 's2' }), '');
  assert.equal(runHook('user-prompt-submit', { session_id: 's2' }), '');
  fs.writeFileSync(path.join(home, 'state', 's2.json'), JSON.stringify({ last: Date.now() - 31 * 60000 }));
  assert.match(runHook('user-prompt-submit', { session_id: 's2' }), /已过 31 分钟/);
  assert.equal(runHook('user-prompt-submit', { session_id: 's2' }), '');
});

test('hook 在坏输入下也安静退出', () => {
  assert.equal(execFileSync('node', [path.join(PKG_ROOT, 'templates', 'hook.mjs'), 'session-start'], {
    input: 'not json', env: { ...process.env, CLAUDE_PROJECT_DIR: '/nonexistent/x' }, encoding: 'utf8',
  }), '');
});
