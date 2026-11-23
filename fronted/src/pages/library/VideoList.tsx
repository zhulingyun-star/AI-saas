import { useNavigate, useSearchParams } from 'react-router-dom';
import { Film, Plus, Upload } from 'lucide-react';
import { Btn, EmptyState, Notice, PageHead, SearchBox } from '../../gy/ui';
import { MODE_LABEL } from '../projects/data';
import {
  DIMS,
  groupBy,
  hookLabel,
  personaLabel,
  REVIEW_STATES,
  reviewState,
  useVideoLibrary,
  videoName,
  type VideoItem,
} from './data';
import { VideoCard } from './parts';

const SORTS = [
  ['', '默认'],
  ['ctr', '点击率'],
  ['cvr', '转化率'],
  ['roi', '投产比'],
] as const;

/** 资产库列表：所有项目出好的成片。左栏选分类方式就按它分组；上面按商品、创作方式、审片状态、开头、人群筛选。 */
export default function VideoList() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { videos, pending, isPending, query } = useVideoLibrary();
  const by = DIMS.find((d) => d.key === params.get('by'));
  const get = (k: string) => params.get(k) ?? '';
  const set = (k: string, v: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (v) next.set(k, v);
        else next.delete(k);
        return next;
      },
      { replace: true },
    );
  const sort = get('sort') as '' | 'ctr' | 'cvr' | 'roi';
  const q = get('q').trim().toLowerCase();
  const filters: [string, string, string[], (v: VideoItem) => string][] = [
    [
      'product',
      '商品',
      uniq(videos.map((v) => v.product?.name ?? '商品不在了')),
      (v) => v.product?.name ?? '商品不在了',
    ],
    [
      'mode',
      '创作方式',
      uniq(videos.map((v) => MODE_LABEL[v.mode] ?? '其他')),
      (v) => MODE_LABEL[v.mode] ?? '其他',
    ],
    ['state', '审片状态', REVIEW_STATES, (v) => reviewState(v)[0]],
    ['hook', '开头类型', uniq(videos.map(hookLabel)), hookLabel],
    ['persona', '人群', uniq(videos.map(personaLabel)), personaLabel],
  ];
  const active = filters.filter(([k]) => get(k));
  let rows = videos.filter(
    (v) =>
      filters.every(([k, , , of]) => !get(k) || of(v) === get(k)) &&
      (!get('perf') || !!v.perf) &&
      (!q ||
        `${videoName(v)} ${v.product?.name ?? ''} ${v.hook} ${v.personaName} ${v.scene} ${v.direction?.title ?? ''} ${v.code} ${v.adName}`
          .toLowerCase()
          .includes(q)),
  );
  if (sort)
    rows = [...rows].sort((a, b) => {
      const x = a.perf?.[sort],
        y = b.perf?.[sort];
      return x == null && y == null ? 0 : x == null ? 1 : y == null ? -1 : y - x;
    });
  const filled = videos.filter((v) => v.perf).length;
  const grid = (list: VideoItem[]) => (
    <div className="gy-vgrid">
      {list.map((v) => (
        <VideoCard key={v.id} v={v} sort={sort} />
      ))}
    </div>
  );

  return (
    <div className="gy-page gy-new">
      <PageHead
        title={by ? `全部成片 · ${by.label}分组` : '全部成片'}
        description="项目里出好的每一版都在这里。左边选一种分类方式，成片会按它分组；点开能看视频、出片词、审片和投放数据。"
      >
        <Btn onClick={() => navigate('/library/import')}>
          <Upload size={14} aria-hidden="true" />
          导入投放表格
        </Btn>
        <Btn variant="primary" onClick={() => navigate('/p/new')}>
          <Plus size={14} aria-hidden="true" />
          新建项目
        </Btn>
      </PageHead>
      <div className="gy-libbar" role="group" aria-label="筛选成片">
        {filters.map(([k, label, options]) => (
          <label key={k} className={`gy-fsel${get(k) ? ' on' : ''}`}>
            {label}
            <select
              aria-label={`按${label}筛选`}
              value={get(k)}
              onChange={(e) => set(k, e.target.value)}
            >
              <option value="">全部</option>
              {options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        ))}
        <span className="gy-sortby">
          排序
          <span className="gy-seg" role="group" aria-label="排序">
            {SORTS.map(([k, t]) => (
              <button
                key={k}
                type="button"
                aria-pressed={sort === k}
                onClick={() => set('sort', k)}
              >
                {t}
              </button>
            ))}
          </span>
        </span>
        <label className="gy-chk">
          <input
            type="checkbox"
            checked={!!get('perf')}
            onChange={(e) => set('perf', e.target.checked ? '1' : '')}
          />
          只看填了投放数据的
        </label>
        <SearchBox
          label="搜索成片"
          placeholder="搜项目、商品、开头、人群或视频编号"
          value={get('q')}
          onChange={(v) => set('q', v)}
        />
      </div>
      {query.error && <Notice tone="error">{(query.error as Error).message}</Notice>}
      {isPending ? (
        <span className="gy-muted">正在加载成片…</span>
      ) : !videos.length ? (
        <EmptyState title="还没有出好的成片" icon={<Film size={22} />}>
          <span>
            项目里每出好一版，就会出现在这里。
            {pending ? `现在有 ${pending} 版还没出好或没出成功，在各自的项目里看。` : ''}
          </span>
          <Btn variant="primary" onClick={() => navigate('/')}>
            去项目
          </Btn>
        </EmptyState>
      ) : !rows.length ? (
        <EmptyState title="没有符合筛选的成片">
          <span>
            {active.length ? `现在按 ${active.map(([, l]) => l).join('、')} 筛选。` : ''}
            {get('perf') ? '只看填了投放数据的。' : ''}
          </span>
          <Btn onClick={() => setParams(by ? { by: by.key } : {}, { replace: true })}>清除筛选</Btn>
        </EmptyState>
      ) : by ? (
        <div className="gy-vgroups">
          {groupBy(rows, by).map((g) => (
            <section
              key={g.key}
              className="gy-vgroup"
              aria-label={`${by.label.slice(1)}：${g.key}`}
            >
              <h2>
                {g.key}
                <small>{g.videos.length} 条</small>
              </h2>
              {grid(g.videos)}
            </section>
          ))}
        </div>
      ) : (
        grid(rows)
      )}
      {videos.length > 0 && (
        <p className="gy-muted gy-libfoot">
          共 {videos.length} 条成片{rows.length !== videos.length ? `，筛出 ${rows.length} 条` : ''}
          ；{filled ? `${filled} 条填了投放数据` : '还没有成片填投放数据'}
          （数字都来自手填或导入的表格）。
          {pending ? ` 另有 ${pending} 版还没出好或没出成功，不算成片。` : ''}
          {sort ? ' 排序时没填数据的排在最后。' : ''}
        </p>
      )}
    </div>
  );
}
function uniq(xs: string[]) {
  return [...new Set(xs)].sort((a, b) => a.localeCompare(b, 'zh'));
}
