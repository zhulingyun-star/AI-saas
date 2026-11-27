import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Plus } from 'lucide-react';
import { ApiError, post, put, request } from '../../api';
import { useWorkspace } from '../../components/UI';
import { Btn, Card, Dialog, EmptyState, Field, Notice, Tabs } from '../../gy/ui';
import { shortTime } from '../projects/data';
import {
  base,
  num,
  qs,
  rate,
  refundTone,
  roi,
  roiTone,
  useCanOperate,
  useRefreshAnalytics,
  yuan,
  type AccountRow,
} from './campaign';
import { FilterBar, useFilters } from './DataBoard';

const VIEWS = ['数据看板', '账户管理'] as const;

/** 账户维度：数据看板（每个千川账户的素材数、消耗、净成交、净 ROI、退款率）和账户管理（手动录入，本期不对接千川接口） */
export default function AccountsTab() {
  const { client } = useWorkspace();
  const { get, set, filter } = useFilters();
  const query = qs({ start: filter.start, end: filter.end });
  const q = useQuery({
    queryKey: [client.id, 'analytics', 'accounts', query],
    queryFn: () => request<{ items: AccountRow[] }>(`${base(client.id)}/accounts${query}`),
  });
  const items = q.data?.items ?? [];
  const view = get('view') === 'manage' || (q.data && !items.length) ? '账户管理' : '数据看板';
  return (
    <>
      <Tabs
        tabs={VIEWS}
        value={view}
        label="账户"
        onChange={(t) => set({ view: t === '账户管理' ? 'manage' : '' })}
      />
      {q.error && <Notice tone="error">{(q.error as Error).message}</Notice>}
      {q.isPending ? (
        <span className="gy-muted">正在加载…</span>
      ) : view === '账户管理' ? (
        <Manage items={items} />
      ) : (
        <>
          <FilterBar
            show={['date', 'client']}
            right={
              <a
                className="gy-btn secondary xs"
                href={`/api${base(client.id)}/accounts/export${query}`}
                download
              >
                <Download size={13} aria-hidden="true" />
                导出 CSV
              </a>
            }
          />
          <Card className="gy-pjs">
            <div className="gy-cptbl-wrap">
              <table className="gy-cptbl" aria-label="账户数据">
                <thead>
                  <tr>
                    <th>账户</th>
                    <th>所属客户</th>
                    <th className="n">素材数</th>
                    <th className="n">总消耗</th>
                    <th className="n">净成交金额</th>
                    <th className="n">净 ROI</th>
                    <th className="n">1 小时退款率</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <b>{a.name}</b>
                        <small className="gy-cpsub">
                          {a.advertiserId}
                          {a.status === 'PAUSED' ? ' · 已停用' : ''}
                        </small>
                      </td>
                      <td>{a.clientName}</td>
                      <td className="n">{num(a.materialCount)}</td>
                      <td className="n">{yuan(a.totalCost)}</td>
                      <td className="n k">{yuan(a.netGmv)}</td>
                      <td className={`n ${roiTone(a.netRoi)}`}>{roi(a.netRoi)}</td>
                      <td className={`n ${refundTone(a.refundRate1h)}`}>{rate(a.refundRate1h)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}

type Draft = { id: string | null; name: string; advertiserId: string; revision: number };

function Manage({ items }: { items: AccountRow[] }) {
  const { client, notify } = useWorkspace();
  const can = useCanOperate();
  const refresh = useRefreshAnalytics();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [del, setDel] = useState<AccountRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      await refresh();
      notify(done);
      return true;
    } catch (e) {
      setErr((e as Error).message + (e instanceof ApiError && e.status === 409 ? '' : ''));
      if (e instanceof ApiError && e.status === 409) await refresh();
      return false;
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!draft) return;
    const ok = await run(
      () =>
        draft.id
          ? put(`${base(client.id)}/accounts/${draft.id}`, {
              name: draft.name,
              advertiserId: draft.advertiserId,
              revision: draft.revision,
            })
          : post(`${base(client.id)}/accounts`, {
              name: draft.name,
              advertiserId: draft.advertiserId,
            }),
      draft.id ? '已保存' : `已添加「${draft.name.trim()}」`,
    );
    if (ok) setDraft(null);
  };
  const toggle = (a: AccountRow) =>
    void run(
      () =>
        put(`${base(client.id)}/accounts/${a.id}`, {
          name: a.name,
          advertiserId: a.advertiserId,
          status: a.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
          revision: a.revision,
        }),
      a.status === 'ACTIVE' ? `已停用「${a.name}」` : `已启用「${a.name}」`,
    );
  const remove = async (a: AccountRow) => {
    const ok = await run(
      () =>
        request(`${base(client.id)}/accounts/${a.id}?revision=${a.revision}`, { method: 'DELETE' }),
      `已删除「${a.name}」`,
    );
    if (ok) setDel(null);
  };
  return (
    <>
      {err && !draft && <Notice tone="error">{err}</Notice>}
      {!can && <Notice tone="info">你的角色只能查看账户。</Notice>}
      <Card className="gy-pjs">
        <h3>
          千川账户
          <small>
            {items.length} 个 · 客户：{client.name}
          </small>
          {can && (
            <Btn
              size="xs"
              variant="primary"
              onClick={() => setDraft({ id: null, name: '', advertiserId: '', revision: 0 })}
            >
              <Plus size={13} aria-hidden="true" />
              添加账户
            </Btn>
          )}
        </h3>
        {!items.length ? (
          <EmptyState title="还没有千川账户">
            <span>添加账户后，导入数据时选它。</span>
            {can && (
              <Btn
                variant="primary"
                onClick={() => setDraft({ id: null, name: '', advertiserId: '', revision: 0 })}
              >
                添加账户
              </Btn>
            )}
          </EmptyState>
        ) : (
          <div className="gy-cptbl-wrap">
            <table className="gy-cptbl" aria-label="千川账户">
              <thead>
                <tr>
                  <th>账户名称</th>
                  <th>广告主 ID</th>
                  <th>所属客户</th>
                  <th>添加时间</th>
                  <th>状态</th>
                  {can && <th aria-label="操作" />}
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <b>{a.name}</b>
                    </td>
                    <td>
                      <code>{a.advertiserId}</code>
                    </td>
                    <td>{a.clientName}</td>
                    <td>{shortTime(a.createdAt)}</td>
                    <td>
                      <span className={`gy-pill ${a.status === 'ACTIVE' ? 'ok' : 'idle'}`}>
                        {a.status === 'ACTIVE' ? '启用' : '已停用'}
                      </span>
                    </td>
                    {can && (
                      <td className="ops">
                        <Btn
                          size="xs"
                          variant="ghost"
                          aria-label={`改「${a.name}」`}
                          onClick={() =>
                            setDraft({
                              id: a.id,
                              name: a.name,
                              advertiserId: a.advertiserId,
                              revision: a.revision,
                            })
                          }
                        >
                          改
                        </Btn>
                        <Btn size="xs" variant="ghost" disabled={busy} onClick={() => toggle(a)}>
                          {a.status === 'ACTIVE' ? '停用' : '启用'}
                        </Btn>
                        <Btn
                          size="xs"
                          variant="ghost"
                          aria-label={`删「${a.name}」`}
                          onClick={() => setDel(a)}
                        >
                          删
                        </Btn>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <span className="gy-fine">只记账户信息，不连千川后台，不会改动账户里的任何投放。</span>
      </Card>
      {draft && (
        <Dialog
          title={draft.id ? '改千川账户' : '添加千川账户'}
          onClose={() => {
            setDraft(null);
            setErr('');
          }}
          width={440}
          footer={
            <>
              <Btn
                variant="ghost"
                onClick={() => {
                  setDraft(null);
                  setErr('');
                }}
              >
                取消
              </Btn>
              <Btn variant="primary" busy={busy} onClick={() => void save()}>
                保存
              </Btn>
            </>
          }
        >
          <div className="gy-dialog-body gy-stack">
            {err && <Notice tone="error">{err}</Notice>}
            <Field label="账户名称" required htmlFor="qc-name">
              <input
                id="qc-name"
                className="gy-input"
                maxLength={100}
                value={draft.name}
                placeholder="例：品牌旗舰店-主账户"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label="千川广告主 ID" required htmlFor="qc-adv">
              <input
                id="qc-adv"
                className="gy-input"
                inputMode="numeric"
                maxLength={30}
                value={draft.advertiserId}
                placeholder="千川后台右上角的数字 ID"
                onChange={(e) => setDraft({ ...draft, advertiserId: e.target.value })}
              />
            </Field>
            <span className="gy-fine">所属客户：{client.name}</span>
          </div>
        </Dialog>
      )}
      {del && (
        <Dialog
          title="删除千川账户"
          onClose={() => setDel(null)}
          width={420}
          footer={
            <>
              <Btn variant="ghost" onClick={() => setDel(null)}>
                不删
              </Btn>
              <Btn danger busy={busy} onClick={() => void remove(del)}>
                删除
              </Btn>
            </>
          }
        >
          <div className="gy-dialog-body">
            删除「{del.name}」？导入过的数据会保留，看板里照常统计。
          </div>
        </Dialog>
      )}
    </>
  );
}
