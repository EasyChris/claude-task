import fs from 'node:fs';
import path from 'node:path';
import { tildify } from './util.mjs';

const MARK = { created: '+', updated: '~', removed: '-', skipped: '·' };
const NOTE = { skipped: '（已存在，未改）' };

// 所有写盘都走这里：统一记录结果，dry-run 时只记录不落盘
export class Writer {
  constructor(root, { dryRun = false } = {}) {
    this.root = root;
    this.dryRun = dryRun;
    this.log = [];
    this.planned = new Map(); // dry-run 时也记住「已经写过」的内容，后面的步骤读到的是计划后的样子
  }

  // 读文件当前（或本次计划写入后）的内容；不存在返回 null
  read(file) {
    if (this.planned.has(file)) return this.planned.get(file);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  }

  write(file, content, { overwrite = false } = {}) {
    const old = this.read(file);
    if (old !== null) {
      if (old === content) return this.record('unchanged', file);
      if (!overwrite) return this.record('skipped', file);
    }
    if (!this.dryRun) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    this.planned.set(file, content);
    return this.record(old !== null ? 'updated' : 'created', file);
  }

  mkdir(dir) {
    if (fs.existsSync(dir)) return this.record('unchanged', dir + path.sep);
    if (!this.dryRun) fs.mkdirSync(dir, { recursive: true });
    return this.record('created', dir + path.sep);
  }

  remove(file) {
    if (!fs.existsSync(file)) return null;
    if (!this.dryRun) fs.unlinkSync(file);
    return this.record('removed', file);
  }

  // 同一个文件写了多次只留一条：后面的「未改 / 跳过」不覆盖前面真正的创建或修改
  record(status, file) {
    const prev = this.log.find((e) => e.file === file);
    if (!prev) this.log.push({ status, file });
    else if (!['unchanged', 'skipped'].includes(status) && prev.status !== 'created') prev.status = status;
    return status;
  }

  display(file) {
    const rel = path.relative(this.root, file);
    return rel.startsWith('..') || path.isAbsolute(rel) ? tildify(file) : rel;
  }

  summary() {
    const lines = this.log
      .filter((e) => e.status !== 'unchanged')
      .map((e) => `  ${MARK[e.status]} ${this.display(e.file)}${NOTE[e.status] || ''}`);
    const same = this.log.filter((e) => e.status === 'unchanged').length;
    if (same) lines.push(`  = ${same} 个文件/目录无需改动`);
    return lines.join('\n');
  }
}
