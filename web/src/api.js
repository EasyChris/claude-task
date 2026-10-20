// 所有接口都带 X-Claude-Task 头（服务端靠它挡跨站请求），cookie 由浏览器自动带上
export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function api(method, url, body) {
  const opts = { method, headers: { 'X-Claude-Task': '1' }, credentials: 'same-origin' };
  if (body instanceof Blob) {
    opts.headers['Content-Type'] = body.type;
    opts.body = body;
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new ApiError(0, '连不上本地服务：终端里的 claude-task web 是不是已经停了？');
  }
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) throw new ApiError(res.status, data.error || `请求失败（${res.status}）`, data);
  return data;
}

export const get = (url) => api('GET', url);

export const P = (pid) => `/api/p/${encodeURIComponent(pid)}`;
export const T = (pid, id) => `${P(pid)}/tasks/${encodeURIComponent(id)}`;
export const B = (pid, id) => `${P(pid)}/backlog/${encodeURIComponent(id)}`;

export const fileUrl = (pid, rel) => `${P(pid)}/file?path=${encodeURIComponent(rel)}`;

// task / backlog 正文里的相对图片路径 → 接口地址；外链原样返回（CSP 会挡住，不泄露访问）
export function imageResolver(pid, dir) {
  return (src) => {
    if (!src || /^(https?:|data:|blob:)/.test(src)) return src;
    return fileUrl(pid, `${dir}/${src.replace(/^\.\//, '')}`);
  };
}
