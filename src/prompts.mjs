import readline from 'node:readline/promises';

// 命令行参数优先；没给的才问。--yes 或非终端环境不问，直接用默认值
export async function collectAnswers(opts, { prev, hasClaudeMd }) {
  const a = {
    name: opts.name ?? prev?.name ?? '',
    intro: opts.intro ?? '',
    features: opts.features ?? '',
    memory: opts.memory ?? prev?.memory ?? 'home',
    hooks: opts.hooks ?? prev?.hooks ?? true,
  };
  if (opts.yes || !process.stdin.isTTY) return a;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q, def) => (await rl.question(def ? `${q}（回车用「${def}」）：` : `${q}：`)).trim() || def;
  try {
    if (opts.name === undefined) a.name = await ask('怎么称呼你', a.name);
    if (!hasClaudeMd) {
      if (opts.intro === undefined) a.intro = await ask('项目介绍（一两句，可留空以后再写）', '');
      if (opts.features === undefined) a.features = await ask('主要功能（逗号分隔，可留空）', '');
    }
    if (opts.memory === undefined) {
      const def = a.memory === 'repo' ? '2' : '1';
      const m = await ask('记忆放哪里？1) ~/.claude/projects（推荐） 2) 仓库 .ai/memory', def);
      a.memory = m === '2' ? 'repo' : 'home';
    }
    if (opts.hooks === undefined) {
      const h = await ask('安装 hooks（开场自动加载记忆、定时提醒写会话记录）？Y/n', a.hooks ? 'Y' : 'n');
      a.hooks = !/^n/i.test(h);
    }
  } finally {
    rl.close();
  }
  return a;
}
