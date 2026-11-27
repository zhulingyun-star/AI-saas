import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  ChartNoAxesCombined,
  Film,
  Flame,
  Images,
  Mic,
  Plus,
  Shirt,
  Trophy,
  User,
} from 'lucide-react';
import { DIMS, useVideoLibrary } from './data';

type Item = [string, string, typeof Film, number | null];

/**
 * 资产库左栏：成片 / 分类方式 / 数据（投放数据、哪种赢了、该换新了）/ 生产资料（全部素材、模特、服装搭配、声音）。
 * 「投放数据」进新版的导入页（/library/import）；旧的 /analytics 是另一套数据，只撤了入口，路由还在。
 * 生产资料用现有的素材页，按类型筛好（/models、/wardrobe、/voices），页里能上传。
 * 样片广场、生成任务、审片交付只撤了入口，路由还在。
 */
export default function LibrarySidebar() {
  const { videos } = useVideoLibrary();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const onList = pathname === '/library';
  const by = onList ? (params.get('by') ?? '') : '';
  const tired = videos.filter((v) => v.tired.length).length;
  const filled = videos.filter((v) => v.perf).length;
  const data: Item[] = [
    ['/library/import', '投放数据', ChartNoAxesCombined, null],
    ['/library/win', '哪种赢了', Trophy, null],
    ['/library/tired', '该换新了', Flame, tired],
  ];
  const stock: Item[] = [
    ['/assets', '全部素材', Images, null],
    ['/models', '模特', User, null],
    ['/wardrobe', '服装搭配', Shirt, null],
    ['/voices', '声音', Mic, null],
  ];
  const links = (list: Item[]) =>
    list.map(([to, label, Icon, n]) => (
      <Link
        key={to}
        to={to}
        title={label}
        aria-current={pathname === to || pathname.startsWith(to + '/') ? 'page' : undefined}
      >
        <Icon size={16} aria-hidden="true" />
        <span className="lbl">{label}</span>
        {n != null && <span className="n">{n}</span>}
      </Link>
    ));
  return (
    <>
      <Link className="gy-side-new" to="/p/new" title="新建项目">
        <Plus size={16} aria-hidden="true" />
        <span className="lbl">新建项目</span>
      </Link>
      <nav className="gy-snav" aria-label="资产库">
        <div className="g">成片</div>
        <Link
          to="/library"
          title="全部成片"
          aria-current={onList && !by ? 'page' : undefined}
        >
          <Film size={16} aria-hidden="true" />
          <span className="lbl">全部成片</span>
          <span className="n">{videos.length}</span>
        </Link>
        <div className="g">分类方式</div>
        {DIMS.map((d) => (
          <Link
            key={d.key}
            to={`/library?by=${d.key}`}
            title={d.label}
            aria-current={by === d.key ? 'page' : undefined}
          >
            <span className="gy-dimdot" aria-hidden="true" />
            <span className="lbl">{d.label}</span>
          </Link>
        ))}
        <div className="g">数据</div>
        {links(data)}
        <div className="g">生产资料</div>
        {links(stock)}
      </nav>
      <div className="gy-side-foot">
        <b>资产库</b>
        {videos.length} 条成片 · {filled ? `${filled} 条有投放数据` : '暂无投放数据'}
      </div>
    </>
  );
}
