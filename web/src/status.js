// tone 对应 CSS 里的颜色变量
export const STATUS = {
  queued: { label: '排队中', tone: 'muted' },
  planning: { label: '规划中', tone: 'plan' },
  awaiting_approval: { label: '待确认', tone: 'wait' },
  in_progress: { label: '进行中', tone: 'active' },
  done: { label: '已完成', tone: 'done' },
  paused: { label: '暂存', tone: 'muted' },
  cancelled: { label: '已取消', tone: 'muted' },
  unknown: { label: '状态未知', tone: 'muted' },
};

// 看板「待开始」列的状态；这些状态的任务再带上 run_order 就在「执行队列」列（和服务端 claude-task-queue.mjs 一致）
export const QUEUE_STATUSES = ['queued', 'planning', 'awaiting_approval'];

// 详情页下拉框里能选的状态（unknown 只能被推断出来，不能手选）
export const EDITABLE = ['queued', 'planning', 'awaiting_approval', 'in_progress', 'done', 'paused', 'cancelled'];

export const PRIORITY = {
  high: { label: '高', tone: 'high' },
  medium: { label: '中', tone: 'medium' },
  low: { label: '低', tone: 'low' },
};

export const KIND = {
  'claude-task': '已接入',
  split: '拆分版',
  legacy: '旧版（兼容读取）',
  none: '未接入',
};

// 索引里的状态文字（可能带 `commit`），卡片上显示去掉反引号
export const cleanNote = (s) => String(s || '').replace(/`/g, '').trim();
