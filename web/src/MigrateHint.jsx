import { useToast } from './ui.jsx';

// 旧版 / 拆分版项目：提醒到项目目录里自己跑 migrate。网页只提醒，不替你迁移（要先看预览再确认）
export function migrateCommand(dir) {
  const p = String(dir || '');
  const quote = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
  let q = p;
  if (!/^[\w./~-]+$/.test(p)) q = p.startsWith('~/') ? `~/${quote(p.slice(2))}` : quote(p); // ~ 放在引号外才会展开
  return `cd ${q} && npx claude-task migrate`;
}

export default function MigrateHint({ dir }) {
  const toast = useToast();
  const cmd = migrateCommand(dir);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      toast('已复制命令', 'ok');
    } catch {
      toast('复制失败，请手动选中命令复制');
    }
  };
  return (
    <div className="migrate-hint" role="note">
      <span className="pill tone-wait">需要迁移</span>
      <span>这个项目还是旧版工作流。在终端里运行下面的命令先看预览，确认后再加 <code>--yes</code>：</span>
      <code className="migrate-cmd">{cmd}</code>
      <button type="button" className="btn small" onClick={copy}>复制命令</button>
    </div>
  );
}
