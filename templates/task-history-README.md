<!-- claude-task:managed · 本文件由 claude-task 维护，update 会覆盖；想自己改就删掉这一行，之后不再覆盖 -->
# 任务记录规范

写任务记录前先读这一份。CLAUDE.md 只放入口，这里放完整规则和模板。

## 目录结构

```
docs/
├── tasks/                         # 每日详情
│   └── YYYY-MM-DD/
│       ├── index.md               # 当日任务索引
│       ├── task-NN.md             # 单个任务详情
│       └── assets/                # 截图等附件（task 里用相对路径引用）
├── backlog/                       # 规划队列（以后要做的事，Web 上可以加、排序、贴图）
│   ├── NN-标题.md                 # 一条规划
│   └── assets/                    # 规划里贴的图，命名 bl-NN-序号.png
└── task-history/                  # 月度索引
    ├── README.md                  # 本文件
    └── YYYY-MM/index.md           # 当月所有任务，一行一个
```

## 什么时候写哪个文件

| 内容 | 路径 | 什么时候写 |
|------|------|------------|
| 当日任务索引 | `docs/tasks/YYYY-MM-DD/index.md` | 每天第一次会话时创建 |
| 单个任务详情 | `docs/tasks/YYYY-MM-DD/task-NN.md` | 计划确认后、写代码前创建 |
| 月度任务索引 | `docs/task-history/YYYY-MM/index.md` | 任务完成后追加一行；当月第一个任务时新建文件夹和文件 |
| 规划 | `docs/backlog/NN-标题.md` | {{name}} 说「以后再做」「先记下来」时；或 {{name}} 在 Web 上添加 |

- `NN` 两位数，当天从 01 往上编；跨天的任务记在开工那天的目录里。
- **CLAUDE.md 不写任何任务行**，月度索引也不写踩坑细节，细节一律进 task 文件。
- 截图放 `assets/`，命名 `task-NN-序号.png`，task 里写 `![说明](assets/task-NN-1.png)`。

## 查历史任务

两处一起搜，只搜月度索引会漏（标题精简过，很多关键词只在 task 文件里）：

```bash
grep -rn "关键词" docs/task-history/ docs/tasks/
```

先看命中的月度索引行，弄清是哪天哪个任务，再打开对应 task 文件读「踩坑记录」和「后续 session 注意」。

## 模板

### task-NN.md

开头的 frontmatter 给程序读（以后的 Web 看板靠它显示状态），**状态以 frontmatter 为准**，正文不再写状态行。

```markdown
---
id: YYYY-MM-DD-NN
title: <一句话任务标题>
status: in_progress
created: YYYY-MM-DDTHH:mm
---

# 任务 N: <任务标题>

- **需求分析**: <需求描述>

## 子任务

- [x] 子任务 1
- [ ] 子任务 2

## 总结
<完成情况>

## 踩坑记录
- <问题和解决方案>

## 后续 session 注意
- <需要注意的事项>
```

`status` 只用下面几个值：

| 值 | 含义 |
|----|------|
| `queued` | 排队中，还没开始 |
| `planning` | 正在出计划 |
| `awaiting_approval` | 计划出好了，等 {{name}} 确认 |
| `in_progress` | 进行中 |
| `done` | 做完了 |
| `paused` | {{name}} 定了先放着 |
| `cancelled` | 不做了 |

上线 commit、待确认这类补充信息写在当日/月度索引行里，不写进 `status`。

没有 frontmatter 的旧 task 文件不用改：工具会按路径推断 `id`、按第一行标题推断 `title`、按子任务勾选情况推断进度。

### backlog/NN-标题.md（规划）

```markdown
---
title: <一句话任务标题>
status: queued          # draft = 草稿（还在整理）；queued = 待执行队列
approved: true          # 计划已在 Web 上确认；开工不用再等确认
priority: medium        # high / medium / low
order: 3                # 排序，越小越靠前；Web 上拖动会改它
created: YYYY-MM-DDTHH:mm
---

<需求、背景、验收标准；图片写 ![说明](assets/bl-NN-1.png)>
```

- 开始做某条规划时：建今天的 `task-NN.md`（frontmatter 加 `from: backlog/<文件名>`，需求分析用规划正文），把 `assets/bl-NN-*` 图片搬到当天 `assets/` 并改名为 `task-NN-*`，然后删掉这条规划文件。Web 上的「开始」按钮做的就是这件事。
- 不要手改别人正在 Web 上编辑的规划；排序只改 `order`。

### 当日 index.md

```markdown
# YYYY-MM-DD 任务索引

- [task-01](task-01.md) <任务标题> — ✅ 已完成
- [task-02](task-02.md) <任务标题> — 🚧 进行中
```

### 月度 index.md

新建时的文件头：

```markdown
# YYYY-MM 任务索引

需求、踩坑、验证数字都在各自的 task 文件里，这里只放一句话标题和结论。

| 日期 | 任务 | 状态 | 文件 |
|------|------|------|------|
```

每个任务追加一行，链接用相对路径：

```markdown
| MM-DD | <一句话任务标题> | ✅ 已上线 `abc1234`（待确认） | [task-NN](../../tasks/YYYY-MM-DD/task-NN.md) |
```

- **任务**：一句话，15~30 字左右，写「做了什么」，不写「怎么做的」。
- **状态**：只写结论，用下面几种：

| 写法 | 含义 |
|------|------|
| `✅ 已完成` | 做完了，不涉及部署 |
| `✅ 已上线 \`commit\`` | 已部署，带上线的 commit |
| `（待确认）` | 跟在上面两种后面，表示 {{name}} 还没确认 |
| `🚧 进行中` | 没做完 |
| `⏸ 暂存` | {{name}} 定了先放着 |
| `↩️ 已回滚 \`commit\`` | 上线后撤回 |
| `📄 文档已交付` | 只有方案文档，没写代码 |

状态变了（比如上线、{{name}} 确认）就回到这一行改掉，不另加新行。
