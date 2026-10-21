// 旧版 CLAUDE.md 的解析：按标题切章节、认出旧流程章节、把历史任务表的行按月份抽出来。
// 只做文本处理，不读写文件。代码块里的标题和表格（模板示例）一律不算。
const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,2})\s+(.+?)\s*$/;
// 这些章节是旧版流程，迁移时整段换成 claude-task 流程块；其他章节原样保留
const LEGACY = /会话开始流程|工作流程要求|任务记录规范|记忆管理|接到任务后的顺序|历史任务/;
const HISTORY = /历史任务/;
const DATED_ROW = /^\s*\|\s*(?:\*\*)?(\d{4})-(\d{2})-\d{2}/;
const DEFAULT_HEADER = '| 日期 | 任务 | 状态 | 文件 |';
const DEFAULT_SEP = '|------|------|------|------|';

const isRow = (l) => /^\s*\|/.test(l);
const isSeparator = (l) => /^\s*\|[\s:|-]+\|\s*$/.test(l);
const norm = (s) => String(s || '').replace(/\s+/g, '');

// 依次回调每一行和它是否在代码块里（开合代码块的那一行也算在里面）
function eachLine(lines, fn) {
  let fence = null;
  for (const line of lines) {
    const m = FENCE.exec(line);
    if (m) {
      if (!fence) fence = m[1];
      else if (m[1] === fence) fence = null;
      fn(line, true);
    } else fn(line, Boolean(fence));
  }
}

export function splitSections(text) {
  const sections = [{ title: null, lines: [] }];
  eachLine(text.split('\n'), (line, fenced) => {
    const h = fenced ? null : HEADING.exec(line);
    if (h) sections.push({ title: h[2], lines: [line] });
    else sections[sections.length - 1].lines.push(line);
  });
  return sections;
}

// 历史任务章节里的表格：首列是日期的行按月份分组，原样搬走（链接改成月度索引里的相对路径）
function extractHistory(section) {
  const out = { header: null, sep: null, rows: [], leftover: [] };
  eachLine(section.lines.slice(1), (line, fenced) => {
    if (fenced || !isRow(line)) return;
    if (isSeparator(line)) {
      out.sep ??= line;
      return;
    }
    const d = DATED_ROW.exec(line);
    if (d) out.rows.push({ month: `${d[1]}-${d[2]}`, line: line.replace(/\]\((?:\.\/)?docs\/tasks\//g, '](../../tasks/') });
    else if (!out.header) out.header = line;
    else out.leftover.push(line);
  });
  return out;
}

// 旧模板里的称呼写法：「**称呼** - 每次对话前都要尊称 Easy」「**称呼 Easy**。」
export function detectName(text) {
  const m = /称呼(?:\*\*)?\s*(?:[-：:]\s*)?(?:每次对话前都要尊称\s*)?([^\s*。，,、]+)/.exec(text);
  return m ? m[1] : null;
}

export function planMigration(text) {
  const plan = { layout: [], kept: [], replaced: [], months: new Map(), header: null, sep: null, leftover: [], name: detectName(text) };
  for (const s of splitSections(text)) {
    if (!s.title || !LEGACY.test(s.title)) {
      plan.layout.push(s);
      if (s.title || s.lines.some((l) => l.trim())) plan.kept.push(s.title || '（开头没有标题的部分）');
      continue;
    }
    plan.replaced.push(s.title);
    if (!plan.layout.includes('BLOCK')) plan.layout.push('BLOCK');
    if (!HISTORY.test(s.title)) continue;
    const h = extractHistory(s);
    plan.header ??= h.header;
    plan.sep ??= h.sep;
    plan.leftover.push(...h.leftover);
    for (const r of h.rows) {
      if (!plan.months.has(r.month)) plan.months.set(r.month, []);
      plan.months.get(r.month).push(r.line);
    }
  }
  if (!plan.layout.includes('BLOCK')) plan.layout.push('BLOCK');
  return plan;
}

const tidy = (lines) => lines.join('\n').replace(/^(?:[ \t]*\n)+/, '').replace(/(?:\n[ \t]*(?:-{3,})?[ \t]*)+$/, '').trimEnd();

// 保留的章节原样拼回去，流程块放在第一个被换掉的章节的位置
export function assemble(plan, block) {
  const leftover = plan.leftover.length
    ? `## 旧版历史任务表里没搬走的行\n\n这些行首列不是日期，迁移时没法分到月度索引，先原样留在这里。\n\n${[plan.header, plan.sep, ...plan.leftover].filter(Boolean).join('\n')}`
    : null;
  const parts = plan.layout.flatMap((s) => (s === 'BLOCK' ? [block, leftover] : [tidy(s.lines)]));
  return parts.filter(Boolean).join('\n\n') + '\n';
}

// 月度索引：没有就新建；有同样表头的表就把新行插到表尾，否则另起一节。已有的行不重复加
export function monthFile(existing, month, header, sep, rows) {
  const head = header || DEFAULT_HEADER;
  const table = (lines) => [head, sep || DEFAULT_SEP, ...lines].join('\n');
  if (existing == null) {
    return `# ${month} 任务索引\n\n从旧版 CLAUDE.md 的历史任务表原样搬过来；之后的新任务按 docs/task-history/README.md 追加。\n\n${table(rows)}\n`;
  }
  const lines = existing.split('\n');
  const fresh = rows.filter((r) => !lines.includes(r));
  if (!fresh.length) return existing;
  const hi = lines.findIndex((l) => isRow(l) && norm(l) === norm(head));
  if (hi < 0) return `${existing.trimEnd()}\n\n## 从旧版 CLAUDE.md 迁移\n\n${table(fresh)}\n`;
  let last = hi;
  while (last + 1 < lines.length && isRow(lines[last + 1])) last += 1;
  lines.splice(last + 1, 0, ...fresh);
  return lines.join('\n');
}
