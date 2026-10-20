# claude-task

一条命令给项目装上 Claude Code 的「任务记录 + 记忆」工作流：

- `CLAUDE.md`：会话开始流程、接任务的顺序、记忆管理规则
- `docs/tasks/YYYY-MM-DD/`：每日任务目录，task 文件带 frontmatter（以后的 Web 看板读它）
- `docs/task-history/`：月度索引 + 记录规范
- 记忆目录：默认 `~/.claude/projects/<项目路径>/memory/`，含 `MEMORY.md` 和 `sessions/`
- Claude Code hooks：会话开始时自动注入记忆索引、最近一份会话记录和今日任务；定时提醒写会话记录

零依赖，Node ≥ 18.3。

## 用法

```bash
cd your-project
npx github:EasyChris/claude-task init      # 交互式提问
npx github:EasyChris/claude-task update    # 模板升级后刷新，自定义内容不动
```

不想被提问时用参数：

```bash
npx github:EasyChris/claude-task init -y --name 你的称呼 --intro "项目介绍" --features "功能A,功能B"
```

| 选项 | 说明 |
|------|------|
| `--name` | Claude 怎么称呼你 |
| `--intro` / `--features` | 项目介绍、主要功能（仅新建 CLAUDE.md 时使用） |
| `--memory home\|repo` | 记忆放 `~/.claude/projects`（默认）还是仓库 `.ai/memory/` |
| `--no-hooks` | 不安装 hooks |
| `-y` | 不提问，用默认值 |
| `--dry-run` | 只预览要改哪些文件 |

## CLAUDE.md 怎么更新

生成的流程写在 `<!-- claude-task:start -->` 和 `<!-- claude-task:end -->` 之间，`update` 只整块替换这一段。块外的内容（项目介绍、你自己加的规则）不会被改动。

已有 CLAUDE.md 时，`init` 会把流程块追加在末尾，原内容保留。

`docs/task-history/README.md` 第一行有 `claude-task:managed` 标记时由工具维护；删掉这一行，之后就不再覆盖。

## 生成了哪些文件

```
项目根/
├── CLAUDE.md
├── .claude/
│   ├── claude-task.json        # 配置（称呼、记忆位置、是否装 hooks）
│   ├── settings.json           # 只增删 claude-task 自己的 hooks，其他配置保留
│   └── hooks/claude-task.mjs   # hook 脚本，本地运行，不联网
└── docs/
    ├── task-history/README.md
    ├── task-history/YYYY-MM/index.md
    └── tasks/YYYY-MM-DD/index.md
```

另外会在 `~/.claude-task/projects.json` 登记项目路径，供以后的 Web 看板使用。

## 开发

```bash
npm test
```

## License

MIT
