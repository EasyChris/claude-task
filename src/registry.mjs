import path from 'node:path';
import { claudeTaskHome, readJSON } from './util.mjs';

// 登记到 ~/.claude-task/projects.json，以后的 Web 看板从这里找所有项目
export function registerProject(root, w) {
  const file = path.join(claudeTaskHome(), 'projects.json');
  const data = readJSON(file) || { projects: [] };
  const prev = data.projects.find((p) => p.path === root);
  const projects = data.projects.filter((p) => p.path !== root);
  projects.push({ path: root, name: path.basename(root), addedAt: prev?.addedAt || new Date().toISOString() });
  projects.sort((a, b) => a.path.localeCompare(b.path));
  w.write(file, JSON.stringify({ projects }, null, 2) + '\n', { overwrite: true });
}
