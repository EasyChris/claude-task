# claude-task

一条命令给项目装上 Claude Code 的「任务记录 + 记忆」工作流：

- `CLAUDE.md`：会话开始流程、接任务的顺序、记忆管理规则
- `docs/tasks/YYYY-MM-DD/`：每日任务目录，task 文件带 frontmatter（以后的 Web 看板读它）
- `docs/task-history/`：月度索引 + 记录规范
- 记忆目录：和 Claude Code 原生 auto memory 同一个（`~/.claude/projects/<主仓库路径>/memory/`，设置了 `autoMemoryDirectory` 就用它），含 `MEMORY.md` 和 `sessions/`
- Claude Code hooks：会话开始时自动注入最近一份会话记录和今日任务（`MEMORY.md` 由 auto memory 自己加载）；定时提醒写会话记录

零依赖，Node ≥ 18.3。

## 用法

```bash
cd your-project
npx github:EasyChris/claude-task init      # 交互式提问
npx github:EasyChris/claude-task update    # 模板升级后刷新，自定义内容不动
npx github:EasyChris/claude-task migrate   # 旧版 CLAUDE.md 迁移（默认只预览，--yes 才写）
npx github:EasyChris/claude-task web       # 打开本地 Web 看板
```

## Web 看板

`claude-task web` 启动一个只监听本机的服务，所有项目共用一个；已经在运行就直接打开浏览器。

- 总览：所有项目的进行中 / 排队 / 本月完成，跨项目的进行中任务
- 看板：规划 / 进行中 / 已完成三列，拖动卡片就是改状态
- 任务详情：直接勾子任务、加子任务、改状态、⌘V 贴图；「编辑原文」保存前会比对，Claude 同时改过就弹冲突框
- 规划：分成「草稿」和「待执行队列」。新建任务时贴需求、贴图，点「AI 整理」：第一轮一次性整理成需求分析 / 子任务 / 验收标准，拿不准的列成待确认问题；可以回答、继续对话或手改，确认后进队列。新开 Claude 会话时 hook 会把队列前 5 条带给 Claude，已确认的计划直接开工
- AI 整理调用本机的 `claude -p`（用你的 Claude Code 登录和额度），只开 Read / Grep / Glob，不加载项目的 hooks 和 MCP，`.env`、密钥类文件拒读
- 历史（按月份、搜正文）、会话记录（只读）
- 扫描目录：把已有 `docs/tasks` 的旧项目加进来，旧格式直接兼容，不改文件；旧版工作流的项目标「需要迁移」，项目页能复制迁移命令（网页只提醒，不替你迁移）

安全：只监听 127.0.0.1，终端打印的网址带一次性 token，换成 HttpOnly cookie；写操作只限 `docs/tasks`、`docs/backlog`。

选项：`--port <端口>`（默认 7432），`--no-open`。

不想被提问时用参数：

```bash
npx github:EasyChris/claude-task init -y --name 你的称呼 --intro "项目介绍" --features "功能A,功能B"
```

| 选项 | 说明 |
|------|------|
| `--name` | Claude 怎么称呼你 |
| `--intro` / `--features` | 项目介绍、主要功能（仅新建 CLAUDE.md 时使用） |
| `--no-hooks` | 不安装 hooks |
| `-y` | 不提问，用默认值 |
| `--dry-run` | 只预览要改哪些文件 |

## 旧项目迁移

CLAUDE.md 里已经有一套旧版「会话开始流程」的项目，在项目目录里运行：

```bash
npx github:EasyChris/claude-task migrate        # 预览：换掉哪些章节、保留哪些、每个月搬几行
npx github:EasyChris/claude-task migrate --yes  # 确认后写入
```

- 一次只迁一个项目，没有批量模式
- 旧流程章节（会话开始流程、工作流程要求、任务记录规范、记忆管理、历史任务）换成流程块，放在原来的位置；其他章节原样保留
- 历史任务表里首列是日期的行原样搬到 `docs/task-history/YYYY-MM/index.md`，不压缩、不改写；首列不是日期的行留在 CLAUDE.md
- 写入前把原 CLAUDE.md 备份到 `.claude/claude-task-backup/`；旧 task 文件和旧记忆不动
- 称呼从旧文件里识别，认不出来就用 `--name` 指定

## CLAUDE.md 怎么更新

生成的流程写在 `<!-- claude-task:start -->` 和 `<!-- claude-task:end -->` 之间，`update` 只整块替换这一段。块外的内容（项目介绍、你自己加的规则）不会被改动。

已有 CLAUDE.md 时，`init` 会把流程块追加在末尾，原内容保留。

`docs/task-history/README.md` 第一行有 `claude-task:managed` 标记时由工具维护；删掉这一行，之后就不再覆盖。

## 生成了哪些文件

```
项目根/
├── CLAUDE.md
├── .claude/
│   ├── claude-task.json        # 配置（称呼、是否装 hooks、提醒间隔）
│   ├── settings.json           # 只增删 claude-task 自己的 hooks，其他配置保留
│   └── hooks/
│       ├── claude-task.mjs         # hook 脚本，本地运行，不联网
│       └── claude-task-memdir.mjs  # 算 auto memory 目录（hook 和 CLI 共用）
└── docs/
    ├── task-history/README.md
    ├── task-history/YYYY-MM/index.md
    └── tasks/YYYY-MM-DD/index.md
```

另外会在 `~/.claude-task/projects.json` 登记项目路径，Web 看板从这里读项目列表。

## 开发

```bash
npm install
npm test
npm run build:web    # 改了 web/src 后重新构建，web/dist 随包发布
```

## License

MIT
