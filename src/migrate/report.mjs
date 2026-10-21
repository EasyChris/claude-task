// migrate 的命令行输出：先说清楚会换掉什么、保留什么、搬走多少行，再列文件
export function migrateReport({ writer, cfg, plan, backup, warnings }) {
  const written = !writer.dryRun;
  const out = [`\nclaude-task migrate${written ? ' 完成' : '（预览，还没写入）'}：`];
  out.push(`\n换成 claude-task 流程块的旧章节（${plan.replaced.length}）：`, ...plan.replaced.map((t) => `  - ${t}`));
  out.push(`\n原样保留的章节（${plan.kept.length}）：`, ...(plan.kept.length ? plan.kept.map((t) => `  - ${t}`) : ['  （无）']));
  if (plan.months.size) {
    out.push('\n历史任务表搬到月度索引（行内容原样，不改写）：');
    for (const [month, rows] of plan.months) out.push(`  - docs/task-history/${month}/index.md：${rows.length} 行`);
  }
  if (plan.leftover.length) out.push(`\n有 ${plan.leftover.length} 行首列不是日期，留在 CLAUDE.md 的「旧版历史任务表里没搬走的行」`);
  out.push(`\n称呼：${cfg.name || '（没识别出来，用 --name 指定）'}`);
  if (warnings.length) out.push('\n注意：', ...warnings.map((t) => `  - ${t}`));
  out.push('\n文件：', writer.summary());
  if (written) {
    out.push(`\n原 CLAUDE.md 备份在 ${writer.display(backup)}`);
    out.push('下一步：看一眼新的 CLAUDE.md，然后新开一个 Claude Code 会话（hooks 新会话才生效）。');
  } else {
    out.push(`\n确认没问题后运行：npx claude-task migrate --yes${cfg.name ? '' : ' --name <称呼>'}`);
  }
  return out.join('\n');
}
