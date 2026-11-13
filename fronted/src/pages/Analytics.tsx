import { useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, Download, BarChart3 } from 'lucide-react';
import { Header, Empty, useData, useWorkspace, useAction, ErrorState } from '../components/UI';
import { request } from '../api';
interface Metric {
  materialId: string;
  impressions: number;
  clicks: number;
  spend: number;
  orders: number;
  revenue: number;
}
interface Report {
  summary: Omit<Metric, 'materialId'> & {
    ctr: number | null;
    cpa: number | null;
    roas: number | null;
  };
  rows: Metric[];
}
export default function Analytics() {
  const { client } = useWorkspace();
  const cache = useQueryClient();
  const data = useData<Report>('metrics');
  const input = useRef<HTMLInputElement>(null);
  const action = useAction();
  const s = data.data?.summary;
  return (
    <>
      <Header
        title="投放数据"
        description="从实际报表看素材表现。按汇总数据计算指标，保留口径与原始明细。"
      >
        <a className="button" href="/report-template.csv" download>
          <Download size={16} />
          CSV 模板
        </a>
        <button className="primary" disabled={action.busy} onClick={() => input.current?.click()}>
          <Upload size={16} />
          {action.busy ? '正在导入…' : '导入投放报表'}
        </button>
        <input
          ref={input}
          type="file"
          accept=".csv"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            action.run(async () => {
              const body = new FormData();
              body.set('file', file);
              await request(`/clients/${client.id}/metrics/import`, { method: 'POST', body });
              await cache.invalidateQueries({ queryKey: [client.id, 'metrics'] });
            }, '报表已导入，按素材 ID 覆盖更新');
            e.target.value = '';
          }}
        />
      </Header>
      {action.error && <ErrorState error={new Error(action.error)} />}
      {data.error && <ErrorState error={data.error} />}
      <section className="stats">
        {[
          ['投放消耗', s ? '¥ ' + s.spend.toFixed(2) : '—', '报表汇总'],
          ['点击率', s?.ctr != null ? (s.ctr * 100).toFixed(2) + '%' : '—', '总点击 ÷ 总曝光'],
          ['订单成本', s?.cpa != null ? '¥ ' + s.cpa.toFixed(2) : '—', '总消耗 ÷ 总订单'],
          ['ROAS', s?.roas != null ? s.roas.toFixed(2) : '—', '总收入 ÷ 总消耗'],
        ].map(([label, value, note]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </div>
        ))}
      </section>
      {!data.data?.rows.length ? (
        <section className="panel">
          <Empty
            title="真实数据进来，复盘才有依据"
            description="下载 CSV 模板，填入授权报表后导入。这里不会展示模拟的增长结果。"
          >
            <BarChart3 size={26} />
          </Empty>
        </section>
      ) : (
        <>
          <section className="panel padded">
            <h2>按素材查看消耗</h2>
            <div className="bar-chart">
              {data.data.rows.slice(0, 8).map((row) => (
                <div key={row.materialId}>
                  <span>{row.materialId}</span>
                  <div>
                    <i
                      style={{
                        width:
                          Math.max(
                            1,
                            (row.spend / Math.max(...data.data!.rows.map((r) => r.spend), 1)) * 100,
                          ) + '%',
                      }}
                    />
                  </div>
                  <b>¥ {row.spend.toFixed(2)}</b>
                </div>
              ))}
            </div>
          </section>
          <section className="panel table-scroll">
            <table>
              <thead>
                <tr>
                  {['素材 ID', '曝光', '点击', '消耗', '订单', '收入', 'ROAS'].map((x) => (
                    <th key={x}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.data.rows.map((r) => (
                  <tr key={r.materialId}>
                    <td>{r.materialId}</td>
                    <td>{r.impressions.toLocaleString()}</td>
                    <td>{r.clicks}</td>
                    <td>¥ {r.spend.toFixed(2)}</td>
                    <td>{r.orders}</td>
                    <td>¥ {r.revenue.toFixed(2)}</td>
                    <td>{r.spend ? (r.revenue / r.spend).toFixed(2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
      <div className="hint">
        导入规则：UTF-8 CSV、最多 2MB / 10000 行；同一素材 ID
        覆盖更新，未出现的记录保留。分母为零时指标显示“—”。当前为手工报表入口，千川授权与自动归因待接入。
      </div>
    </>
  );
}
