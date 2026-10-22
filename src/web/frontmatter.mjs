// 极简 frontmatter：只读写一层 `key: value`，task / backlog 文件够用
const FM = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

const countNewlines = (s) => (s.match(/\n/g) || []).length;

function unquote(v) {
  if (v.startsWith('"')) {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  if (v.length > 1 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

// 会让 YAML 解析出错的值加双引号（JSON 字符串也是合法的 YAML）
function quote(v) {
  const s = String(v);
  return /^[\s"'#&*!|>%@`{[\]-]|:\s|\s#|\s$|^$/.test(s) ? JSON.stringify(s) : s;
}

const keyOf = (line) => (line.includes(':') && !/^\s/.test(line) ? line.slice(0, line.indexOf(':')).trim() : null);

// offset：frontmatter 占了几行，正文第 1 行 = 文件第 offset+1 行
export function parseFrontmatter(text) {
  const m = FM.exec(text);
  if (!m) return { data: null, body: text, offset: 0 };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const key = keyOf(line);
    if (key && !key.startsWith('#')) data[key] = unquote(line.slice(line.indexOf(':') + 1).trim());
  }
  return { data, body: text.slice(m[0].length), offset: countNewlines(m[0]) };
}

// 改/加若干字段，其余行原样保留；没有 frontmatter 就在文件开头新建
export function setFrontmatter(text, fields) {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined && v !== null);
  const m = FM.exec(text);
  if (!m) {
    const head = entries.map(([k, v]) => `${k}: ${quote(v)}`).join('\n');
    return `---\n${head}\n---\n\n${text.replace(/^\s*\n/, '')}`;
  }
  const lines = m[1].split(/\r?\n/);
  for (const [k, v] of entries) {
    const i = lines.findIndex((l) => keyOf(l) === k);
    const line = `${k}: ${quote(v)}`;
    if (i >= 0) lines[i] = line;
    else lines.push(line);
  }
  return `---\n${lines.join('\n')}\n---\n${text.slice(m[0].length)}`;
}

// 删掉若干字段（整行去掉），其余行原样保留；没有 frontmatter 或没有这些字段就原样返回
export function removeFrontmatter(text, keys) {
  const m = FM.exec(text);
  if (!m) return text;
  const lines = m[1].split(/\r?\n/);
  const kept = lines.filter((l) => !keys.includes(keyOf(l)));
  if (kept.length === lines.length) return text;
  return `---\n${kept.join('\n')}\n---\n${text.slice(m[0].length)}`;
}
