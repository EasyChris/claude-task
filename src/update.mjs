import fs from 'node:fs';
import path from 'node:path';
import { findBlock, renderBlock, upsertBlock } from './claudemd.mjs';
import { registerProject } from './registry.mjs';
import { readConfig, templateVars, writeManaged, writeSkeleton } from './scaffold.mjs';
import { UserError, pkgVersion, resolveRoot } from './util.mjs';
import { Writer } from './writer.mjs';

// 只刷新流程块和受管文件；块外的自定义内容、任务记录、记忆内容都不动
export function update(dir, opts = {}) {
  const root = resolveRoot(dir);
  const prev = readConfig(root);
  if (!prev) throw new UserError('没找到 .claude/claude-task.json，这个项目还没 init 过：npx claude-task init');

  const mdFile = path.join(root, 'CLAUDE.md');
  const md = fs.existsSync(mdFile) ? fs.readFileSync(mdFile, 'utf8') : null;
  if (!md || !findBlock(md)) {
    throw new UserError('CLAUDE.md 里没有 claude-task 标记块，无法安全更新；可以重新 npx claude-task init');
  }

  const { memory: _dropped, ...rest } = prev; // 旧版的 memory 选项已去掉，统一用 auto memory 目录
  const cfg = {
    ...rest,
    version: pkgVersion(),
    name: opts.name ?? prev.name,
    hooks: opts.hooks ?? prev.hooks,
  };
  const w = new Writer(root, opts);
  writeManaged(root, cfg, w);
  writeSkeleton(root, cfg, w);
  w.write(mdFile, upsertBlock(md, renderBlock(templateVars(root, cfg))), { overwrite: true });
  registerProject(root, w);
  return { writer: w, cfg };
}
