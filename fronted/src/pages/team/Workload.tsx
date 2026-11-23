import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard } from 'lucide-react';
import { useWorkspace } from '../../components/UI';
import { Card, EmptyState, Notice, PageHead } from '../../gy/ui';
import { MODE_LABEL } from '../projects/data';
import { roleOf, useWorkload, when, type LoadMember } from './data';
import { Avatar, RoleTag } from './parts';

/**
 * 工作负荷：每个人手上有多少项目。只用真实数据：项目的负责人（新建项目时默认是建项目的账号）、
 * 每个项目的出片和审片情况、最近 7 天谁审了多少版。只算你能进的客户。
 */
export default function Workload() {
  const { client } = useWorkspace();
  const w = useWorkload();
  const [by, setBy] = useState<'member' | 'client'>('member');
  const [sel, setSel] = useState<string | null>(null);
  const data = w.data;
  const members = (data?.members ?? []).filter((m) => m.status !== 'DISABLED' || m.projects > 0);
  const current =
    members.find((m) => m.username === sel) ?? members.find((m) => m.inProgress > 0) ?? members[0];
  // 进行中、待审片、出片中按客户合计（包括负责人不是团队账号的项目）；审片数按人合计
  const sum = (k: 'inProgress' | 'unreviewed' | 'running') =>
    (data?.clients ?? []).reduce((a, c) => a + c[k], 0);
  const reviewed = members.reduce((a, m) => a + m.reviewedThisWeek, 0);
  const max = Math.max(1, ...members.map((m) => m.inProgress));
  const projects = (data?.clients ?? []).reduce((a, c) => a + c.projects, 0);
  const busiest = [...members].sort((a, b) => b.unreviewed - a.unreviewed)[0];

  return (
    <div className="gy-page gy-new">
      <PageHead
        title="工作负荷"
        description="每个人手上有多少项目、多少版等着审。项目的负责人默认是建项目的人。只算你能进的客户。"
      >
        <div className="gy-tm-seg" role="group" aria-label="查看方式">
          <button type="button" aria-pressed={by === 'member'} onClick={() => setBy('member')}>
            按成员
          </button>
          <button type="button" aria-pressed={by === 'client'} onClick={() => setBy('client')}>
            按客户
          </button>
        </div>
      </PageHead>
      {w.error ? (
        <Notice tone="error" title="工作负荷没读出来">
          {(w.error as Error).message}
        </Notice>
      ) : !data ? (
        <Card pad>
          <span className="gy-muted">正在统计…</span>
        </Card>
      ) : (
        <>
          <div className="gy-tm-kpis">
            <Card className="gy-tm-kpi">
              <span>进行中的项目</span>
              <b>
                {sum('inProgress')}
                <small>个</small>
              </b>
              <span className="s">还没有可投放版本的项目 · 共 {projects} 个项目</span>
            </Card>
            <Card className="gy-tm-kpi">
              <span>待审片</span>
              <b>
                {sum('unreviewed')}
                <small>版</small>
              </b>
              <span className="s">
                {!sum('unreviewed')
                  ? '没有等着审的版本'
                  : busiest && busiest.unreviewed > 0
                    ? `${busiest.displayName} 手上最多：${busiest.unreviewed} 版`
                    : '都在负责人不是团队账号的项目里'}
              </span>
            </Card>
            <Card className="gy-tm-kpi">
              <span>出片中</span>
              <b>
                {sum('running')}
                <small>版</small>
              </b>
              <span className="s">排队或正在生成</span>
            </Card>
            <Card className="gy-tm-kpi">
              <span>最近 7 天审片</span>
              <b>
                {reviewed}
                <small>版</small>
              </b>
              <span className="s">{members.length} 位成员</span>
            </Card>
          </div>
          {!projects ? (
            <Card>
              <EmptyState title="你能进的客户里还没有项目" icon={<LayoutDashboard size={22} />}>
                <span>有人新建项目以后，这里会按人统计手上的项目、待审片和出片中的版本。</span>
              </EmptyState>
            </Card>
          ) : by === 'member' ? (
            <div className="gy-tm-wl">
              <Card className="gy-table-wrap">
                <table className="gy-goods gy-tm-table">
                  <thead>
                    <tr>
                      <th>成员</th>
                      <th>进行中的项目</th>
                      <th>手上待处理</th>
                      <th className="num">最近 7 天审片</th>
                      <th className="num">全部项目</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr
                        key={m.username}
                        tabIndex={0}
                        className={m.username === current?.username ? 'on' : undefined}
                        aria-label={`看 ${m.displayName} 手上的项目`}
                        onClick={() => setSel(m.username)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') setSel(m.username);
                        }}
                      >
                        <td>
                          <div className="gy-person">
                            <Avatar name={m.displayName} role={m.role} />
                            <span className="gy-tm-pname">
                              <b>
                                {m.displayName}
                                {m.you && <span className="gy-tm-you">你</span>}
                              </b>
                              <small>{roleOf(m.role).label}</small>
                            </span>
                          </div>
                        </td>
                        <td data-label="进行中">
                          <div className="gy-tm-load">
                            <b>{m.inProgress} 个</b>
                            <span className="gy-tm-bar">
                              <i style={{ width: `${(m.inProgress / max) * 100}%` }} />
                            </span>
                          </div>
                        </td>
                        <td className="gy-muted" data-label="待处理">
                          {[
                            m.unreviewed && `待审片 ${m.unreviewed}`,
                            m.running && `出片中 ${m.running}`,
                          ]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </td>
                        <td className="num" data-label="最近 7 天审片">
                          {m.reviewedThisWeek || '—'}
                        </td>
                        <td className="num" data-label="全部项目">
                          {m.projects}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              {current && <Panel m={current} clientId={client.id} />}
            </div>
          ) : (
            <Card className="gy-table-wrap">
              <table className="gy-goods gy-tm-table">
                <thead>
                  <tr>
                    <th>客户</th>
                    <th>客户负责人</th>
                    <th className="num">分到的成员</th>
                    <th className="num">进行中的项目</th>
                    <th className="num">待审片</th>
                    <th className="num">出片中</th>
                  </tr>
                </thead>
                <tbody>
                  {data.clients.map((c) => (
                    <tr key={c.id} className="gy-tm-static">
                      <td>
                        <b style={{ fontWeight: 500 }}>{c.name}</b>
                      </td>
                      <td data-label="客户负责人">
                        {c.leads.length ? (
                          c.leads.join('、')
                        ) : (
                          <span className="gy-muted">由管理员兼管</span>
                        )}
                      </td>
                      <td className="num" data-label="分到的成员">
                        {c.members || <span className="gy-muted">只有管理员</span>}
                      </td>
                      <td className="num" data-label="进行中">
                        {c.inProgress}
                      </td>
                      <td className="num" data-label="待审片">
                        {c.unreviewed || '—'}
                      </td>
                      <td className="num" data-label="出片中">
                        {c.running || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          {data.unassignedProjects > 0 && (
            <p className="gy-goods-foot">
              另有 {data.unassignedProjects}{' '}
              个项目的负责人不是团队账号（以前填的分工联系人），没有算在任何人头上。
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Panel({ m, clientId }: { m: LoadMember; clientId: string }) {
  return (
    <Card className="gy-tm-panel">
      <div className="gy-tm-sph">
        <Avatar name={m.displayName} role={m.role} />
        <span>
          <b>{m.displayName} 手上的项目</b>
          <small>
            <RoleTag role={m.role} /> 进行中 {m.inProgress} 个 · 共 {m.projects} 个
          </small>
        </span>
      </div>
      {m.items.length ? (
        <div className="gy-tm-blist">
          {m.items.map((it) => (
            <div className={`gy-tm-bi${it.inProgress ? '' : ' done'}`} key={it.id}>
              <b>{it.name}</b>
              <small>
                {it.clientName} · {MODE_LABEL[it.mode as keyof typeof MODE_LABEL] ?? '项目'} ·{' '}
                {it.state} · {when(it.updatedAt)}
              </small>
              <span className="act">
                {it.clientId === clientId ? (
                  <Link className="gy-btn secondary xs" to={it.path}>
                    打开
                  </Link>
                ) : (
                  <span className="gy-muted" title="切换到这个客户后才能打开">
                    在别的客户
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="gy-tm-note">
          {m.status === 'PENDING' ? '还没有登录过，手上没有项目。' : '手上还没有项目。'}
        </div>
      )}
    </Card>
  );
}
