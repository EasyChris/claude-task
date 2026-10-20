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
  }

  write(file, content, { overwrite = false } = {}) {
    const exists = fs.existsSync(file);
    if (exists) {
      if (fs.readFileSync(file, 'utf8') === content) return this.record('unchanged', file);
      if (!overwrite) return this.record('skipped', file);
    }
    if (!this.dryRun) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    return this.record(exists ? 'updated' : 'created', file);
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

  record(status, file) {
    this.log.push({ status, file });
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
