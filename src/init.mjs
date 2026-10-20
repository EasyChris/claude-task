import fs from 'node:fs';
import path from 'node:path';
import {
  PLACEHOLDER_FEATURES, PLACEHOLDER_INTRO, formatFeatures, isLegacyWorkflow, renderBlock, renderNewClaudeMd, upsertBlock,
} from './claudemd.mjs';
import { collectAnswers } from './prompts.mjs';
import { registerProject } from './registry.mjs';
import { readConfig, templateVars, writeManaged, writeSkeleton } from './scaffold.mjs';
import { UserError, pkgVersion, resolveRoot } from './util.mjs';
import { Writer } from './writer.mjs';

export async function init(dir, opts = {}) {
  const root = resolveRoot(dir);
  const mdFile = path.join(root, 'CLAUDE.md');
  const md = fs.existsSync(mdFile) ? fs.readFileSync(mdFile, 'utf8') : null;
  if (md && isLegacyWorkflow(md)) {
    throw new UserError(
      'CLAUDE.md 是旧版工作流（有「会话开始流程」但没有 claude-task 标记），直接 init 会出现两套流程。\n'
      + '旧项目请等 `claude-task migrate`（开发中）。',
    );
  }

  const prev = readConfig(root);
  const a = await collectAnswers(opts, { prev, hasClaudeMd: Boolean(md) });
  const cfg = {
    version: pkgVersion(),
    name: a.name,
    memory: a.memory,
    hooks: a.hooks,
    reminderMinutes: prev?.reminderMinutes ?? 30,
  };

  const w = new Writer(root, opts);
  writeManaged(root, cfg, w);
  writeSkeleton(root, cfg, w);
  const vars = templateVars(root, cfg, {
    intro: a.intro || PLACEHOLDER_INTRO,
    features: formatFeatures(a.features) || PLACEHOLDER_FEATURES,
  });
  // 已有 CLAUDE.md（比如 /init 生成的）只插入/替换流程块，原内容保留
  w.write(mdFile, md ? upsertBlock(md, renderBlock(vars)) : renderNewClaudeMd(vars), { overwrite: true });
  registerProject(root, w);
  return { writer: w, cfg };
}
