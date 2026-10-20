// 从粘贴 / 拖放事件里取出第一张图片
export function imageFromEvent(e) {
  const dt = e.clipboardData || e.dataTransfer;
  if (!dt) return null;
  for (const it of dt.items || []) {
    if (it.kind === 'file' && it.type.startsWith('image/')) return it.getAsFile();
  }
  for (const f of dt.files || []) if (f.type.startsWith('image/')) return f;
  return null;
}

export const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

// 在光标处插入文字，并把光标移到插入内容之后
export function insertAtCursor(textarea, text, setValue) {
  const { selectionStart: s, selectionEnd: e, value } = textarea;
  setValue(value.slice(0, s) + text + value.slice(e));
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = s + text.length;
  });
}
