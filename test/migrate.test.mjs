import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, test } from 'node:test';
import { projectKind } from '../src/claudemd.mjs';
import { init } from '../src/init.mjs';
import { migrate } from '../src/migrate/index.mjs';
import { monthFile, planMigration } from '../src/migrate/parse.mjs';
import { migrateReport } from '../src/migrate/report.mjs';
import { update } from '../src/update.mjs';
import { PKG_ROOT } from '../src/util.mjs';

// 样例是照五种真实布局的结构自己编的（不含真实项目内容）：任务表在开头 / 在末尾 / 英文规则混写 / 只有流程 / 拆分版
let root;
let home;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-home-'));
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-proj-')));
  process.env.CLAUDE_CONFIG_DIR = path.join(home, '.claude');
  process.env.CLAUDE_TASK_HOME = path.join(home, '.claude-task');
  process.env.CLAUDE_TASK_MANAGED_DIR = path.join(home, 'managed');
  delete process.env.CLAUDE_CODE_PROJECT_DIR_NAME;
});

const fixture = (name) => fs.readFileSync(path.join(PKG_ROOT, 'test', 'fixtures', 'migrate', `${name}.md`), 'utf8');
const useFixture = (name) => fs.writeFileSync(path.join(root, 'CLAUDE.md'), fixture(name));
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const exists = (...p) => fs.existsSync(path.join(root, ...p));

test('任务表在开头：换掉旧流程、保留其他章节，代码块里的标题和示例行不算', () => {
  const plan = planMigration(fixture('table-top'));
  assert.deepEqual(plan.kept, ['项目介绍', '其他约定']);
  assert.deepEqual(plan.replaced, ['历史任务索引', '⚡ 会话开始流程 (MANDATORY — 最高优先级)', '工作流程要求', '任务记录规范', '记忆管理规范']);
  assert.deepEqual([...plan.months.keys()], ['2026-04', '2026-05']);
  assert.equal(plan.months.get('2026-04').length, 2);
  assert.equal(plan.name, 'Alice');
  assert.equal(plan.header, '| 日期 | 任务 | 状态 | 文件 |');
});

test('默认只预览：什么都不写', () => {
  useFixture('table-top');
  const r = migrate(root, {});
  assert.ok(r.writer.dryRun);
  assert.deepEqual(fs.readdirSync(root), ['CLAUDE.md']);
  assert.equal(read('CLAUDE.md'), fixture('table-top'));
  const report = migrateReport(r);
  assert.match(report, /预览，还没写入/);
  assert.match(report, /docs\/task-history\/2026-04\/index\.md：2 行/);
  assert.match(report, /migrate --yes/);
});

test('--yes：备份原文件、流程块放在原位置、任务行原样搬到月度索引、装好 hooks', () => {
  useFixture('table-top');
  const r = migrate(root, { yes: true });
  const md = read('CLAUDE.md');
  const at = (s) => md.indexOf(s);
  assert.ok(at('## 项目介绍') >= 0 && at('## 项目介绍') < at('<!-- claude-task:start') && at('<!-- claude-task:end') < at('## 其他约定'));
  assert.doesNotMatch(md, /MANDATORY|工作流程要求|记忆管理规范|编辑器骨架/);
  assert.match(md, /称呼 Alice/);
  assert.equal(fs.readFileSync(r.backup, 'utf8'), fixture('table-top'));
  assert.ok(r.backup.startsWith(path.join(root, '.claude', 'claude-task-backup', 'CLAUDE.md.')));
  const april = read('docs', 'task-history', '2026-04', 'index.md');
  assert.match(april, /^# 2026-04 任务索引/);
  assert.ok(april.includes('| 2026-04-16 | **导出 PDF**（这一格很长：表格里有 task 文件没有的结论，迁移时要原样保留） | ✅ 已完成 | [task-01.md](../../tasks/2026-04-16/task-01.md) |'));
  assert.ok(read('docs', 'task-history', '2026-05', 'index.md').includes('同步功能'));
  assert.ok(exists('.claude', 'hooks', 'claude-task.mjs'));
  assert.ok(exists('docs', 'task-history', 'README.md'));
  assert.equal(projectKind(root), 'claude-task');
  assert.throws(() => migrate(root, { yes: true }), /已经接入/);
  update(root, {}); // 迁移完就是普通的已接入项目
  assert.ok(update(root, {}).writer.log.every((e) => e.status === 'unchanged'));
});

test('任务表在末尾：代码块里的标题不切章节，代码块里的示例行不搬', () => {
  const plan = planMigration(fixture('table-bottom'));
  assert.deepEqual(plan.kept, ['部署说明']);
  assert.equal(plan.name, '老大');
  assert.deepEqual([...plan.months.keys()], ['2026-09']);
  assert.equal(plan.months.get('2026-09').length, 1);
});

test('英文规则混写：标题和 Rules 原样保留，表头沿用，首列不是日期的行留在 CLAUDE.md', () => {
  useFixture('mixed-rules');
  migrate(root, { yes: true, name: 'Easy' });
  const md = read('CLAUDE.md');
  assert.match(md, /^# CLAUDE\.md — Project Conventions/);
  assert.match(md, /## Rules\n\n### Rule 1: Use the shared helper\n\nDo not call the standard library directly\./);
  assert.match(md, /## 旧版历史任务表里没搬走的行[\s\S]*\| 待定 \| — \| 整理文档 \|/);
  const oct = read('docs', 'task-history', '2026-10', 'index.md');
  assert.match(oct, /\| 日期 \| 目录 \| 主要内容 \|\n\|------\|------\|----------\|\n\| 2026-10-15 \| `docs\/tasks\/2026-10-15\/` \| 导出脚本 \|/);
  assert.ok(read('docs', 'task-history', '2026-07', 'index.md').includes('修复超时'));
});

test('只有流程没有任务行：CLAUDE.md 只剩流程块，没认出称呼就提示 --name', () => {
  useFixture('flow-only');
  const r = migrate(root, { yes: true });
  assert.match(read('CLAUDE.md'), /^<!-- claude-task:start[\s\S]*<!-- claude-task:end -->\n$/);
  assert.equal(r.plan.months.size, 0);
  assert.match(migrateReport(r), /没识别出来，用 --name 指定/);
});

test('拆分版：保留项目介绍和其他约定，识别称呼', () => {
  useFixture('split');
  fs.mkdirSync(path.join(root, 'docs', 'task-history'), { recursive: true });
  assert.equal(projectKind(root), 'split');
  const plan = planMigration(fixture('split'));
  assert.deepEqual(plan.kept, ['项目介绍', '其他约定']);
  assert.equal(plan.name, 'Easy');
});

test('月度索引合并：同表头插到表尾且不重复，表头不同另起一节', () => {
  const row = (d, t) => `| ${d} | ${t} | ✅ 已完成 | [task-01.md](../../tasks/${d}/task-01.md) |`;
  const existing = `# 2026-10 任务索引\n\n| 日期 | 任务 | 状态 | 文件 |\n|------|------|------|------|\n${row('2026-10-20', '新任务')}\n\n后面的说明\n`;
  const merged = monthFile(existing, '2026-10', '| 日期 | 任务 | 状态 | 文件 |', null, [row('2026-10-20', '新任务'), row('2026-10-01', '旧任务')]);
  assert.equal(merged.match(/新任务/g).length, 1);
  assert.ok(merged.indexOf('旧任务') < merged.indexOf('后面的说明'));
  const other = monthFile(existing, '2026-10', '| 日期 | 目录 | 主要内容 |', '|---|---|---|', ['| 2026-10-02 | x | y |']);
  assert.match(other, /## 从旧版 CLAUDE\.md 迁移\n\n\| 日期 \| 目录 \| 主要内容 \|\n\|---\|---\|---\|\n\| 2026-10-02 \| x \| y \|\n$/);
  assert.equal(monthFile(merged, '2026-10', '| 日期 | 任务 | 状态 | 文件 |', null, [row('2026-10-01', '旧任务')]), merged);
});

test('不需要迁移的情况都报错且不写文件；init 遇到旧版提示用 migrate', async () => {
  assert.throws(() => migrate(root, {}), /没有 CLAUDE\.md/);
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# 普通项目\n');
  assert.equal(projectKind(root), 'none');
  assert.throws(() => migrate(root, {}), /没有旧版工作流/);
  useFixture('flow-only');
  assert.equal(projectKind(root), 'legacy');
  await assert.rejects(init(root, { yes: true }), /npx claude-task migrate/);
  assert.deepEqual(fs.readdirSync(root), ['CLAUDE.md']);
});
