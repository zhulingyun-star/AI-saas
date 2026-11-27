import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Lightbulb, RefreshCw } from 'lucide-react';
import { ApiError, post, put, request } from '../../api';
import { useWorkspace } from '../../components/UI';
import { Btn, Card, EmptyState, Notice, PageHead } from '../../gy/ui';
import { shortTime } from '../projects/data';
import {
  base,
  num,
  PARAM_LABEL,
  rate,
  roi,
  STATUS_LABEL,
  useCanOperate,
  useRefreshAnalytics,
  yuan,
  type Rule,
  type Suggestion,
  type SuggestionStatus,
} from './campaign';
import { NameCell, Thumb } from './DataBoard';
import { TiredView } from './Insights';

const TABS = ['待处理', '已接受', '已执行', '已忽略', '该换新了', '规则'] as const;
type Tab = (typeof TABS)[number];
const TAB_STATUS: Partial<Record<Tab, SuggestionStatus>> = {
  待处理: 'PENDING',
  已接受: 'ACCEPTED',
  已执行: 'DONE',
  已忽略: 'REJECTED',
};
const KEY: Record<string, Tab> = {
  tired: '该换新了',
  rules: '规则',
  accepted: '已接受',
  done: '已执行',
  rejected: '已忽略',
};
const PARAM_OF: Partial<Record<Tab, string>> = {
  该换新了: 'tired',
  规则: 'rules',
  已接受: 'accepted',
  已执行: 'done',
  已忽略: 'rejected',
};

/**
 * 投放建议：按四条规则从真实投放数据里挑出来的「建议…」。接受、忽略、标记已执行都只是记录，
 * 系统不会去千川后台做任何操作；要停投、加预算请自己去千川后台。
 */
export default function Suggestions() {
  const { client } = useWorkspace();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: Tab = KEY[params.get('tab') ?? ''] ?? '待处理';
  const can = useCanOperate();
  const refresh = useRefreshAnalytics();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const { notify } = useWorkspace();
  const q = useQuery({
    queryKey: [client.id, 'analytics', 'suggestions'],
    queryFn: () =>
      request<{ items: Suggestion[]; counts: Record<string, number> }>(
        `${base(client.id)}/suggestions?status=ALL`,
      ),
  });
  const counts = q.data?.counts ?? {};
  const status = TAB_STATUS[tab];
  const items = (q.data?.items ?? []).filter((x) => x.status === status);
  const decide = async (s: Suggestion, action: 'accepted' | 'rejected' | 'done') => {
    setBusy(true);
    setErr('');
    try {
      await post(`${base(client.id)}/suggestions/${s.id}/decide`, { action, revision: s.revision });
      await refresh();
      notify(
        action === 'accepted'
          ? '已接受，去千川后台操作'
          : action === 'done'
            ? '已标记为执行'
            : '已忽略',
      );
    } catch (e) {
      setErr((e as Error).message);
      if (e instanceof ApiError && e.status === 409) await refresh();
    } finally {
      setBusy(false);
    }
  };
  const scan = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await post<{ created: number }>(`${base(client.id)}/suggestions/scan`, {});
      await refresh();
      notify(r.created ? `新增 ${r.created} 条建议` : '没有新的建议');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const label = (t: Tab) => {
    const st = TAB_STATUS[t];
    return st ? `${t} ${counts[st.toLowerCase()] ?? 0}` : t;
  };
  return (
    <div className="gy-page gy-new">
      <PageHead
        title="投放建议"
        description="按投放数据给出建议。只记录你的决定，操作请到千川后台。"
      >
        {can && (
          <Btn busy={busy} onClick={() => void scan()}>
            <RefreshCw size={14} aria-hidden="true" />
            重新检查
          </Btn>
        )}
      </PageHead>
      <div className="gy-tabs" role="tablist" aria-label="建议状态">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={t === tab}
            onClick={() => setParams(PARAM_OF[t] ? { tab: PARAM_OF[t]! } : {}, { replace: true })}
          >
            {label(t)}
          </button>
        ))}
      </div>
      {err && <Notice tone="error">{err}</Notice>}
      {tab === '该换新了' ? (
        <TiredView embedded />
      ) : tab === '规则' ? (
        <Rules can={can} />
      ) : q.isPending ? (
        <span className="gy-muted">正在加载…</span>
      ) : !items.length ? (
        <EmptyState
          title={tab === '待处理' ? '没有待处理的建议' : `没有${tab}的建议`}
          icon={<Lightbulb size={22} />}
        >
          {tab === '待处理' && (
            <>
              <span>导入数据后会自动检查，每天早上也会查一遍。</span>
              <span className="gy-row">
                <Btn onClick={() => navigate('/library/data/import')}>导入数据</Btn>
                <Btn variant="ghost" onClick={() => setParams({ tab: 'rules' }, { replace: true })}>
                  看规则
                </Btn>
              </span>
            </>
          )}
        </EmptyState>
      ) : (
        <div className="gy-sglist">
          {items.map((s) => (
            <SuggestionCard key={s.id} s={s} can={can} busy={busy} decide={decide} />
          ))}
        </div>
      )}
    </div>
  );
}

const TONE: Record<Suggestion['type'], string> = {
  STOP: 'bad',
  ITERATE: 'bad',
  INCREASE_BUDGET: 'good',
  CHECK: 'warn',
};

function SuggestionCard({
  s,
  can,
  busy,
  decide,
}: {
  s: Suggestion;
  can: boolean;
  busy: boolean;
  decide: (s: Suggestion, a: 'accepted' | 'rejected' | 'done') => void;
}) {
  const x = s.snapshot;
  const facts: [string, string][] = [
    ['消耗', yuan(x.totalCost)],
    ['净成交', yuan(x.netGmv)],
    ['净 ROI', roi(x.netRoi)],
    ['净订单', num(x.netOrders)],
    ['净结算率', rate(x.netSettleRate)],
    ['1 小时退款率', rate(x.refundRate1h)],
    ['数据天数', num(x.dataDays)],
  ];
  return (
    <Card className="gy-sgcard" aria-label={`${s.typeLabel}：${s.job.standardName ?? s.job.title}`}>
      <Link
        to={`/library/${s.job.id}`}
        className="gy-sgwho"
        aria-label={`看成片：${s.job.standardName ?? s.job.title}`}
      >
        <Thumb coverId={s.job.coverId} />
      </Link>
      <div className="gy-sgbody">
        <div className="gy-sghead">
          <span className={`gy-sgtype ${TONE[s.type]}`}>{s.typeLabel}</span>
          <span className="gy-muted">{s.ruleName}</span>
          <span className="gy-muted">数据截至 {s.dataThrough.slice(5)}</span>
        </div>
        <Link to={`/library/${s.job.id}`} className="gy-sgname">
          <NameCell name={s.job.standardName} />
          <small>{s.job.title}</small>
        </Link>
        <p className="gy-sgreason">{s.reason}</p>
        <dl className="gy-sgfacts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {x.rule && <span className="gy-fine">规则：{x.rule}</span>}
        <div className="gy-sgacts">
          {s.status === 'PENDING' && can && (
            <>
              <Btn
                size="xs"
                variant="primary"
                disabled={busy}
                onClick={() => decide(s, 'accepted')}
              >
                接受
              </Btn>
              <Btn size="xs" disabled={busy} onClick={() => decide(s, 'done')}>
                已执行
              </Btn>
              <Btn size="xs" variant="ghost" disabled={busy} onClick={() => decide(s, 'rejected')}>
                忽略
              </Btn>
            </>
          )}
          {s.status === 'ACCEPTED' && can && (
            <Btn size="xs" variant="primary" disabled={busy} onClick={() => decide(s, 'done')}>
              标记已执行
            </Btn>
          )}
          {s.status !== 'PENDING' && (
            <span className="gy-muted">
              {STATUS_LABEL[s.status]} · {s.decidedBy} · {shortTime(s.decidedAt)}
            </span>
          )}
          <Link className="gy-sglink" to={`/library/data/materials?job=${s.job.id}`}>
            看数据
          </Link>
        </div>
      </div>
    </Card>
  );
}

function Rules({ can }: { can: boolean }) {
  const { client, notify } = useWorkspace();
  const refresh = useRefreshAnalytics();
  const q = useQuery({
    queryKey: [client.id, 'analytics', 'rules'],
    queryFn: () => request<Rule[]>(`${base(client.id)}/suggestion-rules`),
  });
  const [edit, setEdit] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const save = async (r: Rule, enabled: boolean) => {
    setBusy(r.key);
    setErr('');
    try {
      const params = Object.fromEntries(
        Object.entries(edit[r.key] ?? {}).map(([k, v]) => [k, Number(v)]),
      );
      await put(`${base(client.id)}/suggestion-rules/${r.key}`, {
        enabled,
        params,
        revision: r.revision,
      });
      setEdit((e) => ({ ...e, [r.key]: {} }));
      await refresh();
      notify(`已保存「${r.name}」`);
    } catch (e) {
      setErr((e as Error).message);
      await q.refetch();
    } finally {
      setBusy('');
    }
  };
  if (q.isPending) return <span className="gy-muted">正在加载…</span>;
  return (
    <>
      {err && <Notice tone="error">{err}</Notice>}
      <div className="gy-sgrules">
        {(q.data ?? []).map((r) => {
          const draft = edit[r.key] ?? {};
          const dirty = Object.keys(draft).length > 0;
          return (
            <Card key={r.key} className="gy-pjs" aria-label={`规则：${r.name}`}>
              <h3>
                {r.name}
                <small>{r.typeLabel}</small>
                <label className="gy-chk">
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    disabled={!can || busy === r.key}
                    aria-label={`启用「${r.name}」`}
                    onChange={(e) => void save(r, e.target.checked)}
                  />
                  {r.enabled ? '启用' : '停用'}
                </label>
              </h3>
              <span className="gy-sgcond">{r.condition}</span>
              <div className="gy-sgparams">
                {Object.entries(r.params).map(([k, v]) => {
                  const [lab, unit] = PARAM_LABEL[k] ?? [k, ''];
                  return (
                    <label key={k}>
                      <span>{lab}</span>
                      <input
                        className="gy-input"
                        type="number"
                        min={0}
                        step="any"
                        disabled={!can}
                        aria-label={`${r.name}：${lab}`}
                        value={draft[k] ?? String(v)}
                        onChange={(e) =>
                          setEdit((x) => ({ ...x, [r.key]: { ...draft, [k]: e.target.value } }))
                        }
                      />
                      {unit && <em>{unit}</em>}
                    </label>
                  );
                })}
                {can && dirty && (
                  <Btn
                    size="xs"
                    variant="primary"
                    busy={busy === r.key}
                    onClick={() => void save(r, r.enabled)}
                  >
                    保存
                  </Btn>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
