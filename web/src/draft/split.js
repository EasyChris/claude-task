// 批量新建：把一大段文字拆成多条草稿
// 有单独一行 `---` 就只按它拆（每条里可以有空行）；没有就按空行拆。标题取每段第一行（和新建任务一样）
export const titleOf = (text) => String(text).trim().split('\n')[0].replace(/^[#\s>*-]+/, '').slice(0, 30) || '未命名任务';

export function splitDrafts(text) {
  const src = String(text || '').replace(/\r\n/g, '\n');
  const parts = /^\s*---\s*$/m.test(src) ? src.split(/^\s*---\s*$/m) : src.split(/\n\s*\n/);
  return parts.map((p) => p.trim()).filter(Boolean).map((body) => ({ title: titleOf(body), body }));
}
