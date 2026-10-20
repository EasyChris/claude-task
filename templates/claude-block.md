<!-- claude-task:start v{{version}} · 本块由 claude-task 生成，`npx claude-task update` 会整块覆盖；要改的内容请写在块外 -->

## 历史任务

- **月度索引**：`docs/task-history/YYYY-MM/index.md`，一行一个任务（一句话标题 + 结论）。
- **任务详情**：`docs/tasks/YYYY-MM-DD/task-NN.md`，开头带 frontmatter（`id / title / status / created`）。
- **记录规范与模板**：[docs/task-history/README.md](docs/task-history/README.md)，写任务记录前先读。

开工前先搜相关历史，两处一起搜（标题精简过，很多关键词只在 task 文件里）：

```bash
grep -rn "关键词" docs/task-history/ docs/tasks/
```

**本文件不写任何任务行。**

---

## ⚡ 会话开始流程（最高优先级，不得跳过）
{{#hooks}}
> 已装 hooks：会话开始时会自动注入记忆索引、最近一份会话记录和今日任务索引（以 `[claude-task]` 开头），今日目录也会自动建好。看到注入内容就不用再读这些文件；没看到再按下面手动做。
{{/hooks}}

1. **称呼 {{name}}**。
2. **加载项目记忆**：读 `{{memoryDir}}MEMORY.md`，再读 `sessions/` 下**最新的一份**会话记录（看上次做到哪、留了什么待办）。
3. **检查今日目录** `docs/tasks/YYYY-MM-DD/`：
   - 存在 → 读 `index.md`，汇报今日已完成/未完成任务
   - 不存在 → 创建目录和空 `index.md`
4. **向 {{name}} 汇报记忆状态**，格式：
   ```
   ✓ 已加载项目记忆：
   - MEMORY.md（N 条记忆）
   - 最近会话：sessions/YYYY-MM-DD-NN.md（<一句话标题>）
   - 上次待办：<没有就写「无」>
   ```
5. **询问 {{name}} 今天要做什么**。

## 接到任务后的顺序（禁止跳步）

1. 分析需求，搜相关历史任务，列编号步骤的计划。
2. **等 {{name}} 确认计划**。
3. 确认后先建 `docs/tasks/YYYY-MM-DD/task-NN.md`（frontmatter `status: in_progress` + 需求分析 + 全部子任务 `[ ]`），并在当日 `index.md` 加一行。
4. 再开始写代码；每完成一个子任务就把 `[ ]` 改成 `[x]`。
5. 全部完成后把 frontmatter 的 `status` 改成 `done`，补齐 task 文件的「总结 / 踩坑记录 / 后续 session 注意」。
6. 在当月 `docs/task-history/YYYY-MM/index.md` 追加一行（当月第一个任务就新建这个文件）。

复杂任务逐步执行，**每完成一步向 {{name}} 汇报**。

---

## 记忆管理

记忆目录：`{{memoryDir}}`

- **结构是平铺的**：一条记忆一个 `.md` 文件（带 frontmatter：`name` / `description` / `metadata.type`），`MEMORY.md` 是索引，每条一行 `- [标题](文件.md) — 一句话`。
- **同主题多的用子索引**：例如某模块的记忆都挂在 `<主题>-index.md` 下，`MEMORY.md` 只留一行指向它。新增同主题记忆写进子索引，不动 `MEMORY.md`。
- **该记什么**：业务口径、踩过的坑、架构约束、{{name}} 的偏好与决定。**不记**代码结构、git 历史、task 文件里已有的流水账。
- **什么时候写**：修了重要 Bug、做了架构决策、{{name}} 拍板了某个口径，或 {{name}} 说「记住这个」。
- **写前先查**：已有相近的就更新那条，不要新建重复的；发现过时或错误的立刻改或删。
- **一条记忆一个主题**，相关记忆之间用 `[[name]]` 互相链接。
- **写完告诉 {{name}}**：「已更新记忆：<文件路径>」。
- `MEMORY.md` 保持 200 行以内、只放一行指针，内容不要写回索引里。
- 记忆目录不存在时先创建，并初始化 `MEMORY.md`。

### 会话记录

{{#hooks}}hooks 每隔约 {{reminder}} 分钟、以及上下文被压缩后，会提醒你写会话记录（以 `[claude-task]` 开头）；收到提醒、或会话要结束时，写/更新一份会话记录：{{/hooks}}{{^hooks}}对话进行约 {{reminder}} 分钟、上下文被压缩后，以及会话结束时，写/更新一份会话记录：{{/hooks}}

- 路径：`sessions/YYYY-MM-DD-NN.md`（在记忆目录下；`NN` 当天从 01 编号；同一会话继续写就更新原文件，不新建）。
- `MEMORY.md` 里只有一行指向 `sessions/`，**不要**给每份会话记录单独加索引行。
- 会话里出现值得长期记住的东西（Bug 根因、口径决定、架构约束），另外写成单条记忆，会话记录里链接过去。

```markdown
# Session YYYY-MM-DD-NN - <简短标题>

**时间**: YYYY-MM-DD HH:mm
**任务类型**: 功能开发 / Bug 修复 / 重构 / 文档
**关联任务**: docs/tasks/YYYY-MM-DD/task-NN.md

## 任务概述
<本次会话做了什么>

## 关键决策
- <决策>（原因：<理由>）

## 代码变更
- `path/to/file`: <新增/修改了什么>

## 经验教训
- <学到的东西；已写成单条记忆的写 [[name]]>

## 待办事项
- [ ] <没做完的>
```

---

## 通用约定

- 用中文记录（代码除外）。
- 很长的 json 文件只抽结构看，不必全读。
- **源码文件不超过 200 行**，超过就拆分。

<!-- claude-task:end -->
