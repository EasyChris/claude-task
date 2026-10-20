// 合并 .claude/settings.json 里的 hooks：只增删 claude-task 自己的条目，别的原样保留
export const HOOK_SCRIPT = '.claude/hooks/claude-task.mjs';
// hook 依赖的记忆目录算法，和 hook 放在一起，跟着 hook 一起装/删
export const MEMDIR_SCRIPT = '.claude/hooks/claude-task-memdir.mjs';

const EVENTS = {
  SessionStart: 'session-start',
  UserPromptSubmit: 'user-prompt-submit',
};

const isOurs = (h) => String(h?.command || '').includes('claude-task.mjs');

export function hookCommand(arg) {
  return `node "$CLAUDE_PROJECT_DIR/${HOOK_SCRIPT}" ${arg}`;
}

export function mergeHooks(settings, enable) {
  const out = structuredClone(settings || {});
  const hooks = { ...(out.hooks || {}) };
  for (const [event, arg] of Object.entries(EVENTS)) {
    const groups = (hooks[event] || [])
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) }))
      .filter((g) => g.hooks.length);
    if (enable) groups.push({ hooks: [{ type: 'command', command: hookCommand(arg), timeout: 10 }] });
    if (groups.length) hooks[event] = groups;
    else delete hooks[event];
  }
  if (Object.keys(hooks).length) out.hooks = hooks;
  else delete out.hooks;
  return out;
}
