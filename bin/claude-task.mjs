#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { init } from '../src/init.mjs';
import { migrate } from '../src/migrate/index.mjs';
import { migrateReport } from '../src/migrate/report.mjs';
import { update } from '../src/update.mjs';
import { UserError, memoryDirDisplay, pkgVersion, resolveRoot } from '../src/util.mjs';

const HELP = `claude-task ${pkgVersion()} — 给项目装上 Claude Code 任务记录 + 记忆工作流

用法：
  npx claude-task init     在当前目录初始化（CLAUDE.md、docs/tasks、记忆目录、hooks）
  npx claude-task update   模板升级后刷新流程块和 hooks，自定义内容不动
  npx claude-task migrate  旧版 CLAUDE.md 迁移到 claude-task（默认只预览，加 --yes 才写入；一次一个项目）
  npx claude-task web      打开本地 Web 看板（所有项目共用一个服务，已在运行就直接打开）

选项：
  --name <称呼>            Claude 怎么称呼你
  --intro <文字>           项目介绍（仅新建 CLAUDE.md 时使用）
  --features <a,b,c>       主要功能，逗号分隔（仅新建 CLAUDE.md 时使用）
  --no-hooks               不安装 hooks（--hooks 重新装上）
  -y, --yes                不提问，没给的选项用默认值；migrate：确认写入
  --dry-run                只预览要改哪些文件，不写入
  --port <端口>            web：指定端口（默认 7432，被占用就往后找）
  --no-open                web：不自动打开浏览器
  -h, --help / -v, --version`;

function parse(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      name: { type: 'string' },
      intro: { type: 'string' },
      features: { type: 'string' },
      hooks: { type: 'boolean' },
      'no-hooks': { type: 'boolean' },
      yes: { type: 'boolean', short: 'y' },
      'dry-run': { type: 'boolean' },
      port: { type: 'string' },
      'no-open': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  const opts = {
    name: values.name,
    intro: values.intro,
    features: values.features,
    hooks: values['no-hooks'] ? false : values.hooks,
    yes: values.yes,
    dryRun: values['dry-run'],
  };
  return { command: positionals[0], opts, values };
}

async function main() {
  const { command, opts, values } = parse(process.argv.slice(2));
  if (values.version) return console.log(pkgVersion());
  if (values.help || !command) return console.log(HELP);

  if (command === 'web') {
    const port = values.port === undefined ? undefined : Number(values.port);
    if (port !== undefined && !(Number.isInteger(port) && port > 0 && port < 65536)) throw new UserError('--port 应该是 1~65535 的整数');
    const { runWeb } = await import('../src/web/launch.mjs');
    return void (await runWeb({ port, open: !values['no-open'] }));
  }

  const root = resolveRoot(process.cwd());
  if (command === 'migrate') return console.log(migrateReport(migrate(root, opts)));
  let result;
  if (command === 'init') result = await init(root, opts);
  else if (command === 'update') result = update(root, opts);
  else throw new UserError(`不认识的命令：${command}\n\n${HELP}`);

  const { writer, cfg } = result;
  console.log(`\nclaude-task ${command}${opts.dryRun ? '（预览，未写入）' : ' 完成'}：`);
  console.log(writer.summary());
  console.log(`\n记忆目录：${memoryDirDisplay(root)}`);
  if (command === 'init' && !opts.dryRun) {
    console.log('下一步：检查 CLAUDE.md 的「项目介绍 / 主要功能」，然后新开一个 Claude Code 会话（hooks 新会话才生效）。');
  }
}

main().catch((e) => {
  const known = e instanceof UserError || e.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION' || e.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE';
  console.error(known ? `claude-task: ${e.message}` : e);
  process.exit(1);
});
