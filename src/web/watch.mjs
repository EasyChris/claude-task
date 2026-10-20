// 监听每个项目的 docs/ 和记忆目录，有变化就按项目通知页面（300ms 内的连续变化合并成一次）
import fs from 'node:fs';
import path from 'node:path';
import { registryFile } from '../registry.mjs';
import { projectMemoryDir } from './sessions.mjs';

function watchDir(dir, fn) {
  try {
    const w = fs.watch(dir, { recursive: true }, fn);
    w.on('error', () => {});
    return w;
  } catch {
    return null; // 目录不存在，或平台不支持递归监听
  }
}

export class Watcher {
  constructor(onChange) {
    this.onChange = onChange;
    this.projects = new Map();
    this.timers = new Map();
    this.registry = null;
  }

  sync(projects) {
    const want = new Map(projects.map((p) => [p.id, p.path]));
    for (const [id, w] of this.projects) {
      if (want.get(id) !== w.root) {
        w.close();
        this.projects.delete(id);
      }
    }
    for (const [id, root] of want) {
      if (this.projects.has(id)) continue;
      const handles = [path.join(root, 'docs'), projectMemoryDir(root)]
        .map((dir) => watchDir(dir, () => this.debounce(id, () => this.onChange(id))))
        .filter(Boolean);
      this.projects.set(id, { root, close: () => handles.forEach((h) => h.close()) });
    }
  }

  watchRegistry(fn) {
    const dir = path.dirname(registryFile());
    fs.mkdirSync(dir, { recursive: true });
    this.registry = fs.watch(dir, (_, file) => {
      if (file === 'projects.json') this.debounce('*registry', fn);
    });
    this.registry.on('error', () => {});
  }

  debounce(key, fn) {
    clearTimeout(this.timers.get(key));
    this.timers.set(key, setTimeout(fn, 300));
  }

  close() {
    for (const w of this.projects.values()) w.close();
    this.registry?.close();
    for (const t of this.timers.values()) clearTimeout(t);
  }
}
