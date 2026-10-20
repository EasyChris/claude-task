// 按行比较两段文字（LCS）。返回 [类型, 行]：' ' 相同，'-' 只在 a 里，'+' 只在 b 里
export function lineDiff(a, b) {
  const A = a.split('\n');
  const B = b.split('\n');
  const n = A.length;
  const m = B.length;
  if (n * m > 4e6) return null; // 太大就不算了，界面上改成并排显示
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push([' ', A[i++]]);
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push(['-', A[i++]]);
    else out.push(['+', B[j++]]);
  }
  while (i < n) out.push(['-', A[i++]]);
  while (j < m) out.push(['+', B[j++]]);
  return out;
}

// 连续很多行没变化的折叠起来，只留改动前后各 2 行
export function collapse(diff, ctx = 2) {
  const keep = diff.map(([t]) => t !== ' ');
  const show = diff.map((_, k) => keep.slice(Math.max(0, k - ctx), k + ctx + 1).some(Boolean));
  const out = [];
  let skipped = 0;
  diff.forEach((row, k) => {
    if (show[k]) {
      if (skipped) out.push(['…', `（${skipped} 行没有变化）`]);
      skipped = 0;
      out.push(row);
    } else skipped++;
  });
  if (skipped) out.push(['…', `（${skipped} 行没有变化）`]);
  return out;
}
