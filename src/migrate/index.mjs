// migrate：把旧版工作流的 CLAUDE.md 换成 claude-task 流程块。一次只迁一个项目。
// 默认只预览，--yes 才写；写之前把原 CLAUDE.md 备份到 .claude/claude-task-backup/。
import fs from 'node:fs';
import path from 'node:path';
import { findBlock, isLegacyWorkflow, renderBlock } from '../claudemd.mjs';
import { registerProject } from '../registry.mjs';
import { readConfig, templateVars, writeManaged, writeSkeleton } from '../scaffold.mjs';
import { UserError, memoryDir, pkgVersion, resolveRoot } from '../util.mjs';
import { Writer } from '../writer.mjs';
import { assemble, monthFile, planMigration } from './parse.mjs';

export const BACKUP_DIR = path.join('.claude', 'claude-task-backup');
const LIMIT = { lines: 200, bytes: 25 * 1024 }; // auto memory 开场只加载 MEMORY.md 的这么多

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function memoryWarnings(mem) {
  const out = [];
  try {
    const t = fs.readFileSync(path.join(mem, 'MEMORY.md'), 'utf8');
    const lines = t.trimEnd().split('\n').length;
    const bytes = Buffer.byteLength(t);
    if (lines > LIMIT.lines || bytes > LIMIT.bytes) {
      out.push(`MEMORY.md 有 ${lines} 行 / ${(bytes / 1024).toFixed(1)}KB，超过 auto memory 开场加载的上限（200 行或 25KB），超出的部分开场看不到；建议把同主题的拆进子索引`);
    }
  } catch {}
  try {
    if (fs.readdirSync(mem).some((f) => /^\d{4}$/.test(f))) {
      out.push('记忆目录里有旧版按年份存的会话记录（YYYY/…），hook 只读 sessions/ 下的；旧记录不动，之后的会话记录写进 sessions/');
    }
  } catch {}
  return out;
}

export function migrate(dir, opts = {}) {
  const root = resolveRoot(dir);
  const mdFile = path.join(root, 'CLAUDE.md');
  const md = fs.existsSync(mdFile) ? fs.readFileSync(mdFile, 'utf8') : null;
  if (!md) throw new UserError('这个目录没有 CLAUDE.md，不用迁移；新项目直接 npx claude-task init');
  if (findBlock(md)) throw new UserError('CLAUDE.md 已经接入 claude-task，不用迁移；模板升级用 npx claude-task update');
  if (!isLegacyWorkflow(md)) {
    throw new UserError('CLAUDE.md 里没有旧版工作流（「会话开始流程」），不用迁移；直接 npx claude-task init，原内容会保留');
  }

  const plan = planMigration(md);
  const prev = readConfig(root);
  const cfg = {
    version: pkgVersion(),
    name: opts.name ?? plan.name ?? prev?.name ?? '',
    hooks: opts.hooks ?? prev?.hooks ?? true,
    reminderMinutes: prev?.reminderMinutes ?? 30,
  };
  const w = new Writer(root, { dryRun: !opts.yes || opts.dryRun });
  writeManaged(root, cfg, w); // 先读 settings.json，坏 JSON 在写任何文件之前就报错
  const backup = path.join(root, BACKUP_DIR, `CLAUDE.md.${stamp()}`);
  w.write(backup, md);
  for (const [month, rows] of plan.months) {
    const file = path.join(root, 'docs', 'task-history', month, 'index.md');
    w.write(file, monthFile(w.read(file), month, plan.header, plan.sep, rows), { overwrite: true });
  }
  writeSkeleton(root, cfg, w);
  w.write(mdFile, assemble(plan, renderBlock(templateVars(root, cfg))), { overwrite: true });
  registerProject(root, w);
  return { writer: w, cfg, plan, backup, warnings: memoryWarnings(memoryDir(root)) };
}
