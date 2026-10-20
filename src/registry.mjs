import path from 'node:path';
import { claudeTaskHome, readJSON } from './util.mjs';

export const registryFile = () => path.join(claudeTaskHome(), 'projects.json');

const idBase = (name) => String(name).replace(/[\s/\\?#%&:]+/g, '-').replace(/^-+|-+$/g, '') || 'project';

// 每个项目一个稳定的 id（Web 网址里用），重名时加 -2、-3；已有 id 的不改
export function assignIds(projects) {
  const used = new Set(projects.map((p) => p.id).filter(Boolean));
  return projects.map((p) => {
    if (p.id) return p;
    const base = idBase(p.name || path.basename(p.path));
    let id = base;
    for (let k = 2; used.has(id); k++) id = `${base}-${k}`;
    used.add(id);
    return { id, ...p };
  });
}

export const sortProjects = (projects) => [...projects].sort((a, b) => a.path.localeCompare(b.path));

// 登记到 ~/.claude-task/projects.json，Web 看板从这里找所有项目
export function registerProject(root, w) {
  const file = registryFile();
  const data = readJSON(file) || { projects: [] };
  const prev = data.projects.find((p) => p.path === root);
  const others = data.projects.filter((p) => p.path !== root);
  const entry = { ...(prev?.id ? { id: prev.id } : {}), path: root, name: path.basename(root), addedAt: prev?.addedAt || new Date().toISOString() };
  const projects = sortProjects(assignIds([...others, entry]));
  w.write(file, JSON.stringify({ projects }, null, 2) + '\n', { overwrite: true });
}
