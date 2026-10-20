import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, test } from 'node:test';
import { init } from '../src/init.mjs';
import { memoryDir, projectSlug } from '../src/util.mjs';

// 记忆目录要和 Claude Code 的 auto memory 算出同一个（规则见 templates/claude-task-memdir.mjs）
let root;
let home;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-home-'));
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-proj-'));
  process.env.CLAUDE_CONFIG_DIR = path.join(home, '.claude');
  process.env.CLAUDE_TASK_HOME = path.join(home, '.claude-task');
  process.env.CLAUDE_TASK_MANAGED_DIR = path.join(home, 'managed'); // 不读本机真实的 managed 设置
  delete process.env.CLAUDE_CODE_PROJECT_DIR_NAME;
});

const memDir = () => path.join(home, '.claude', 'projects', projectSlug(fs.realpathSync(root)), 'memory');
const opts = { yes: true, name: 'Easy', intro: '测试项目', features: '' };

test('记忆目录与 auto memory 一致：worktree 和子目录归到主仓库，autoMemoryDirectory 优先', () => {
  const main = path.join(fs.realpathSync(root), 'main');
  fs.mkdirSync(path.join(main, 'sub'), { recursive: true });
  const git = (...a) => execFileSync('git', a, { cwd: main, stdio: 'ignore' });
  git('init', '-q');
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
  git('worktree', 'add', '-q', '../wt', '-b', 'wt');
  const expected = path.join(home, '.claude', 'projects', projectSlug(main), 'memory');
  assert.equal(memoryDir(main), expected);
  assert.equal(memoryDir(path.join(main, 'sub')), expected);
  assert.equal(memoryDir(path.join(fs.realpathSync(root), 'wt')), expected);
  fs.mkdirSync(path.join(main, '.claude'));
  fs.writeFileSync(path.join(main, '.claude', 'settings.json'), JSON.stringify({ autoMemoryDirectory: '~/my-mem' }));
  assert.equal(memoryDir(main), path.join(os.homedir(), 'my-mem'));
});

test('autoMemoryDirectory 只认绝对路径或 ~/，不合法的跳过往下一层找', () => {
  const r = fs.realpathSync(root);
  const set = (file, v) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ autoMemoryDirectory: v }));
  };
  set(path.join(home, '.claude', 'settings.json'), '/abs/user-mem');
  set(path.join(r, '.claude', 'settings.json'), 'relative/mem');
  set(path.join(r, '.claude', 'settings.local.json'), '~not-home/mem');
  assert.equal(memoryDir(r), '/abs/user-mem');
  set(path.join(r, '.claude', 'settings.local.json'), '~/local-mem');
  assert.equal(memoryDir(r), path.join(os.homedir(), 'local-mem'));
});

test('managed 设置优先，managed-settings.d 按字母顺序后读的覆盖先读的', () => {
  const r = fs.realpathSync(root);
  const managed = path.join(home, 'managed');
  fs.mkdirSync(path.join(managed, 'managed-settings.d'), { recursive: true });
  fs.mkdirSync(path.join(r, '.claude'));
  fs.writeFileSync(path.join(r, '.claude', 'settings.local.json'), JSON.stringify({ autoMemoryDirectory: '/abs/local' }));
  fs.writeFileSync(path.join(managed, 'managed-settings.json'), JSON.stringify({ autoMemoryDirectory: '/abs/managed' }));
  assert.equal(memoryDir(r), '/abs/managed');
  fs.writeFileSync(path.join(managed, 'managed-settings.d', '10-a.json'), JSON.stringify({ autoMemoryDirectory: '/abs/d10' }));
  fs.writeFileSync(path.join(managed, 'managed-settings.d', '20-b.json'), JSON.stringify({ other: 1 }));
  fs.writeFileSync(path.join(managed, 'managed-settings.d', '.hidden.json'), JSON.stringify({ autoMemoryDirectory: '/abs/hidden' }));
  assert.equal(memoryDir(r), '/abs/d10');
});

test('CLAUDE_CODE_PROJECT_DIR_NAME：需同时设 CLAUDE_CONFIG_DIR，名字不合法就忽略', () => {
  const r = fs.realpathSync(root);
  const derived = path.join(home, '.claude', 'projects', projectSlug(r), 'memory');
  process.env.CLAUDE_CODE_PROJECT_DIR_NAME = 'work_1';
  assert.equal(memoryDir(r), path.join(home, '.claude', 'projects', 'work_1', 'memory'));
  for (const bad of ['a/b', 'con', 'x'.repeat(65)]) {
    process.env.CLAUDE_CODE_PROJECT_DIR_NAME = bad;
    assert.equal(memoryDir(r), derived);
  }
  process.env.CLAUDE_CODE_PROJECT_DIR_NAME = 'work_1';
  delete process.env.CLAUDE_CONFIG_DIR;
  const realHome = process.env.HOME;
  process.env.HOME = home; // 不读本机真实的 ~/.claude/settings.json
  try {
    assert.equal(memoryDir(r), path.join(home, '.claude', 'projects', projectSlug(r), 'memory'));
  } finally {
    process.env.HOME = realHome;
  }
});

test('装进项目的 hook 能找到同目录的 memdir 模块', async () => {
  await init(root, opts);
  fs.writeFileSync(path.join(memDir(), 'sessions', '2026-10-20-01.md'), '# Session 装好的');
  const out = execFileSync('node', [path.join(root, '.claude', 'hooks', 'claude-task.mjs'), 'session-start'], {
    input: JSON.stringify({ session_id: 's4', source: 'startup' }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_TASK_STATE_DIR: path.join(home, 'state') },
    encoding: 'utf8',
  });
  assert.match(out, /# Session 装好的/);
});
