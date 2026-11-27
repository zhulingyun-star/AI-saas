import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen, LayoutDashboard, ListTodo, Plus } from 'lucide-react';
import { useWorkspace } from '../../components/UI';
import { FolderGroup } from '../../gy/folders';
import { inFolder, useProjectLibrary, useRefreshProjects } from './data';

/** 项目左栏：新建项目 + 文件夹（规则同商品库），下面是我的待办和客户知识。快捷制作、批量排产只撤了入口，路由还在。 */
export default function ProjectSidebar() {
  const { client } = useWorkspace();
  const { folders, projects } = useProjectLibrary();
  const refresh = useRefreshProjects();
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const onList = pathname === '/';
  const current = onList ? (params.get('folder') ?? 'all') : '';
  const go = (folder: string) =>
    navigate(folder === 'all' ? '/' : `/?folder=${encodeURIComponent(folder)}`);
  const folderParam =
    current && current !== 'all' && current !== 'unfiled' ? `?folder=${current}` : '';
  const old: [string, string, typeof ListTodo][] = [
    ['/tasks', '我的待办', ListTodo],
    ['/presets', '客户知识', BookOpen],
  ];
  return (
    <>
      <Link className="gy-side-new" to={`/p/new${folderParam}`} title="新建项目">
        <Plus size={16} aria-hidden="true" />
        <span className="lbl">新建项目</span>
      </Link>
      <nav className="gy-snav" aria-label="项目文件夹">
        <FolderGroup
          folders={folders}
          current={current}
          onSelect={go}
          all={{
            label: '全部项目',
            icon: <LayoutDashboard size={16} aria-hidden="true" />,
            count: projects.length,
          }}
          count={(id) => inFolder(projects, folders, id).length}
          unfiled={projects.filter((p) => !p.folderId).length}
          endpoint={`/clients/${client.id}/project-folders`}
          onChanged={refresh}
        />
        <div className="g">其他</div>
        {old.map(([to, label, Icon]) => (
          <Link
            key={to}
            to={to}
            title={label}
            aria-current={pathname === to || pathname.startsWith(to + '/') ? 'page' : undefined}
          >
            <Icon size={16} aria-hidden="true" />
            <span className="lbl">{label}</span>
          </Link>
        ))}
      </nav>
      <div className="gy-side-foot">
        <b>{client.name}</b>
        {projects.length} 个项目 · {folders.length} 个文件夹
      </div>
    </>
  );
}
