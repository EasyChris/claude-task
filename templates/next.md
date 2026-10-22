---
description: 按执行队列做下一条任务（一次只做一条，做完停下汇报）
allowed-tools: Bash(node .claude/hooks/claude-task.mjs queue)
---
<!-- claude-task v{{version}} · 本文件由 claude-task 生成，`npx claude-task update` 会覆盖；`--no-hooks` 时会删掉 -->

{{name}} 让你按执行队列做下一条任务。下面是刚读出来的进行中任务和执行队列：

!`node .claude/hooks/claude-task.mjs queue`

执行队列 = task frontmatter 里有 `run_order`（正整数）、状态不是进行中 / 已完成 / 暂存 / 取消的任务，按 `run_order` 从小到大。{{name}} 在 `npx claude-task web` 的看板上拖动排序。

按下面的规则做，**一次只做一条**：

1. **执行队列为空**：直接告诉 {{name}}「执行队列是空的」，停下，什么都不做。
2. **已经有任务在进行中**：先问 {{name}}：接着做进行中的这条，还是先把它放回执行队列？等回答再动，这一轮不改任何文件。
   - 放回执行队列 = 它的 frontmatter 改成 `status: queued`、`run_order` 设成比队列第 1 条还小（排到队首，比如原来第 1 条是 1，就把队列里的都往后挪一位，它设成 1）。
3. **否则取执行队列第 1 条**：
   - 打开它的 task 文件，frontmatter 改成 `status: in_progress`，**删掉 `run_order` 这一行**，把本次会话 id 追加到 `sessions`；当日 `index.md` 里这一行改成 🚧 进行中。
   - 用一句话告诉 {{name}} 打算怎么做。
   - frontmatter 有 `approved: true` 的，计划已经确认过，不再等确认，直接开工。
   - 没有 `approved: true` 的，按 CLAUDE.md「接到任务后的顺序」先列计划，等 {{name}} 确认再写代码。
4. **做完并验证后**：frontmatter 改成 `status: done`（加 `completed: YYYY-MM-DDTHH:mm`），勾完子任务，补齐「总结 / 踩坑记录 / 后续 session 注意」，更新当日 `index.md` 和当月月度索引（沿用 CLAUDE.md 的规则）。然后停下，向 {{name}} 汇报做了什么，并说「执行队列还剩 N 条，输入 /next 继续」（N = 上面执行队列条数减 1）。**绝对不要自己接着做下一条。**
5. **遇到需要 {{name}} 决定的问题**：把这条任务的 frontmatter 改成 `status: awaiting_approval`，停下来问，等回答。
6. 改文件、跑命令弹出的授权框照常由 {{name}} 在终端里手动点，不要建议放开权限或改 settings。
