import { useNavigate, useSearchParams } from 'react-router-dom';
import { Flame, Trophy } from 'lucide-react';
import { Btn, Card, EmptyState, PageHead } from '../../gy/ui';
import {
  fix,
  pct,
  useVideoLibrary,
  videoName,
  WIN_DIMS,
  winRows,
  winSay,
  type WinRow,
} from './data';
import { VideoCard } from './parts';

const TIRED_RULE = '点击率掉了 30% 以上、负反馈超过 0.8%、有效播放低于 25%（用 3 秒留存看）';

/** 哪种赢了：把填了投放数据的成片按一个维度分组，比平均点击率、转化率、投产比。只用真实填的数据。 */
export function WinView() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { videos, isPending } = useVideoLibrary();
  const dim = WIN_DIMS.find((d) => d.key === params.get('by')) ?? WIN_DIMS[0];
  const withData = videos.filter((v) => v.perf);
  const rows = winRows(withData, dim.of);
  const max = (k: 'ctr' | 'cvr' | 'roi') => Math.max(0, ...rows.map((r) => r[k] ?? 0));
  const M = { ctr: max('ctr'), cvr: max('cvr'), roi: max('roi') };
  const cell = (r: WinRow, k: 'ctr' | 'cvr' | 'roi') => {
    const x = r[k];
    if (x == null) return <td className="gy-muted">—</td>;
    return (
      <td>
        <span className="gy-winbar" aria-hidden="true">
          <i style={{ width: `${M[k] ? Math.round((x / M[k]) * 100) : 0}%` }} />
        </span>
        <b>{k === 'roi' ? fix(x) : pct(x)}</b>
        {x === M[k] && rows.length > 1 && <em className="gy-wtop">最高</em>}
      </td>
    );
  };
  const tired = withData.filter((v) => v.tired.length);
  return (
    <div className="gy-page gy-new">
      <PageHead
        title="哪种赢了"
        description="把填了投放数据的成片按一个维度分组，比平均点击率、转化率、投产比。只算真实填了数据的成片。"
      />
      {isPending ? (
        <span className="gy-muted">正在加载…</span>
      ) : !withData.length ? (
        <EmptyState title="还没有成片填了投放数据，比不出来" icon={<Trophy size={22} />}>
          <span>
            资产库里的 {videos.length}{' '}
            条成片都还没有投放数据。投放以后，在成片详情里点「填数据」，或者「导入投放表格」，这里就会按开头类型、人群、场景等分组比较。
          </span>
          <span className="gy-row">
            <Btn variant="primary" onClick={() => navigate('/library')}>
              去给成片填数据
            </Btn>
            <Btn onClick={() => navigate('/library/import')}>导入投放表格</Btn>
          </span>
        </EmptyState>
      ) : (
        <>
          <Card className="gy-pjs">
            <h3>
              按什么比
              <small>
                {withData.length} 条有数据的成片（共 {videos.length} 条）
              </small>
            </h3>
            <div className="gy-seg" role="group" aria-label="比较维度">
              {WIN_DIMS.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  aria-pressed={d.key === dim.key}
                  onClick={() => setParams({ by: d.key }, { replace: true })}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <div className="gy-winsay" role="status">
              {winSay(rows, dim.suffix)}
            </div>
            <div className="gy-wintbl-wrap">
              <table className="gy-wintbl">
                <thead>
                  <tr>
                    <th>{dim.label}</th>
                    <th>成片条数</th>
                    <th>平均点击率</th>
                    <th>平均转化率</th>
                    <th>平均投产比</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.group}>
                      <td>
                        <b>{r.group}</b>
                      </td>
                      <td>
                        {r.n} 条{r.n < 3 && <span className="gy-fewtag">样本太少，仅供参考</span>}
                      </td>
                      {cell(r, 'ctr')}
                      {cell(r, 'cvr')}
                      {cell(r, 'roi')}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <span className="gy-fine">
              每条成片先算自己的累计（比例按曝光加权），再在组里取平均，每条成片分量一样。没填成交单数或投产比的成片不算进那一列。少于
              3 条的分组只能看个方向。
            </span>
          </Card>
          {tired.length > 0 && <TiredCard list={tired} />}
        </>
      )}
    </div>
  );
}

function TiredCard({ list }: { list: ReturnType<typeof useVideoLibrary>['videos'] }) {
  const navigate = useNavigate();
  return (
    <Card className="gy-pjs">
      <h3>
        该换新了
        <small>
          {list.length} 条 · 判断依据：{TIRED_RULE}
        </small>
      </h3>
      {list.map((v) => (
        <button
          key={v.id}
          type="button"
          className="gy-tiredrow"
          onClick={() => navigate(`/library/${v.id}`)}
        >
          <span>
            <b>{videoName(v)}</b>
            <small>{v.tired.join('、')}</small>
          </span>
          <span className="gy-btn secondary xs">看详情、接力</span>
        </button>
      ))}
    </Card>
  );
}

/** 该换新了：只看填了投放数据、并且碰到了信号的成片 */
export function TiredView() {
  const navigate = useNavigate();
  const { videos, isPending } = useVideoLibrary();
  const withData = videos.filter((v) => v.perf);
  const tired = withData.filter((v) => v.tired.length);
  return (
    <div className="gy-page gy-new">
      <PageHead
        title="该换新了"
        description={`按投放数据查素材有没有变累：${TIRED_RULE}。至少要 3 条有曝光的记录才判断，按天填最准。`}
      >
        <Btn onClick={() => navigate('/library/import')}>导入投放表格</Btn>
      </PageHead>
      {isPending ? (
        <span className="gy-muted">正在加载…</span>
      ) : !withData.length ? (
        <EmptyState title="还没有成片填了投放数据，判断不了" icon={<Flame size={22} />}>
          <span>
            填了投放数据（最好按天填）以后，这里会列出点击率往下掉、负反馈变多、留存太低的成片。
          </span>
          <Btn variant="primary" onClick={() => navigate('/library')}>
            去给成片填数据
          </Btn>
        </EmptyState>
      ) : !tired.length ? (
        <EmptyState title="目前没有该换新的成片">
          <span>
            {withData.length} 条填了数据的成片都没碰到这三个信号。记录少于 3 条的还判断不了。
          </span>
        </EmptyState>
      ) : (
        <>
          <div className="gy-vgrid">
            {tired.map((v) => (
              <VideoCard
                key={v.id}
                v={v}
                extra={<span className="gy-tiredwhy">{v.tired.join('、')}</span>}
              />
            ))}
          </div>
          <p className="gy-muted">
            {tired.length} 条该换新了 · 共 {withData.length}{' '}
            条成片填了投放数据。点开能看每个信号的具体数字，再选怎么接力。
          </p>
        </>
      )}
    </div>
  );
}
