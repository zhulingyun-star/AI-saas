import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  ChartNoAxesCombined,
  Film,
  Flame,
  Images,
  Layers,
  ListChecks,
  Mic,
  Plus,
  Shirt,
  Trophy,
  Upload,
  User,
  Video,
} from 'lucide-react';
import { DIMS, useVideoLibrary } from './data';

/** 资产库左栏：全部成片 / 该换新了 / 哪种赢了 / 导入投放表格，分类方式，下面是还在用的旧页面。 */
export default function LibrarySidebar() {
  const { videos } = useVideoLibrary();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const onList = pathname === '/library';
  const by = onList ? (params.get('by') ?? '') : '';
  const tired = videos.filter((v) => v.tired.length).length;
  const filled = videos.filter((v) => v.perf).length;
  const views: [string, string, typeof Film, number | null][] = [
    ['/library', '全部成片', Film, videos.length],
    ['/library/tired', '该换新了', Flame, tired],
    ['/library/win', '哪种赢了', Trophy, null],
    ['/library/import', '导入投放表格', Upload, null],
  ];
  const old: [string, string, typeof Film][] = [
    ['/gallery', '样片广场', Layers],
    ['/queue', '生成任务', Video],
    ['/review', '审片交付', ListChecks],
    ['/analytics', '旧的投放数据', ChartNoAxesCombined],
    ['/assets', '全部素材', Images],
    ['/models', '模特', User],
    ['/wardrobe', '服装搭配', Shirt],
    ['/voices', '声音', Mic],
  ];
  return (
    <>
      <Link className="gy-side-new" to="/p/new" title="新建项目">
        <Plus size={16} aria-hidden="true" />
        <span className="lbl">新建项目</span>
      </Link>
      <nav className="gy-snav" aria-label="资产库">
        <div className="g">成片</div>
        {views.map(([to, label, Icon, n]) => (
          <Link
            key={to}
            to={to}
            title={label}
            aria-current={
              (to === '/library' ? onList && !by : pathname === to) ? 'page' : undefined
            }
          >
            <Icon size={16} aria-hidden="true" />
            <span className="lbl">{label}</span>
            {n != null && <span className="n">{n}</span>}
          </Link>
        ))}
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
        <div className="g">以前的页面</div>
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
        <b>资产库</b>
        {videos.length} 条成片 · {filled ? `${filled} 条填了投放数据` : '还没有投放数据'}
      </div>
    </>
  );
}
