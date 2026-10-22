#!/usr/bin/env node
// 测试用的假 claude：记录收到的参数和提示词，按 stream-json 格式回一份固定的整理结果
//   提示词里有 SLOW：一直不结束（测停止）；有 BADJSON：不给 structured_output（测格式错误）
//   有 WAIT：过 300ms 再回（测排队：同时最多跑 3 条，结束一条自动开下一条）
import fs from 'node:fs';

const args = process.argv.slice(2);
const input = fs.readFileSync(0, 'utf8');
if (process.env.FAKE_CLAUDE_LOG) fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({ args, input, baseUrl: process.env.ANTHROPIC_BASE_URL || null }) + '\n');

const k = args.indexOf('--resume');
const resume = k >= 0 ? args[k + 1] : null;
const sid = resume || `sess-${process.pid}`;
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');

out({ type: 'system', subtype: 'init', session_id: sid, tools: ['Read', 'Grep', 'Glob'] });
if (input.includes('SLOW')) {
  setTimeout(() => {}, 60000);
} else {
  if (input.includes('WAIT')) await new Promise((r) => setTimeout(r, 300));
  out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '整理中' } } });
  out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Grep', input: { pattern: 'export' } }] } });
  const first = !resume;
  const structured = {
    title: first ? '库存页导出 Excel' : '库存页导出 Excel（含价格权限）',
    summary: '销售要导出库存，带上当前筛选条件。',
    subtasks: first ? ['后端导出接口', '前端导出按钮'] : ['后端导出接口', '前端导出按钮', '价格列只给管理员'],
    acceptance: ['导出的数据和页面筛选一致'],
    questions: first ? [{ q: '价格列要不要导？', suggestion: '只给管理员导' }, { q: '导出全部还是当前页？', suggestion: '全部' }] : [],
    references: ['src/api.py'],
    reply: first ? '整理好了，有两个问题要你定。' : '按你的回答改好了。',
  };
  out({
    type: 'result',
    subtype: 'success',
    is_error: false,
    session_id: sid,
    result: JSON.stringify(structured),
    structured_output: input.includes('BADJSON') ? undefined : structured,
    total_cost_usd: 0.01,
  });
}
