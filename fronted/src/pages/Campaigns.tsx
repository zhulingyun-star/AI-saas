import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import {
  Header,
  Field,
  Modal,
  Empty,
  Loading,
  ErrorState,
  useData,
  useWorkspace,
  useAction,
} from '../components/UI';
import { ProductionNav } from '../components/ProductionNav';
import { post, put } from '../api';
import { phases, type Campaign, type Work, type Contact } from '../types';

export default function Campaigns() {
  const data = useData<Campaign[]>('campaigns', true);
  const [filter, setFilter] = useState('active');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Campaign | true | null>(null);
  const list =
    data.data?.filter(
      (c) =>
        (filter === 'all' || c.archived === (filter === 'archived')) &&
        `${c.name} ${c.ownerName}`.includes(query),
    ) ?? [];
  return (
    <>
      <Header title="项目总览" description="">
        <button className="primary" onClick={() => setEditing(true)}>
          新建交付项目
          <Plus size={16} />
        </button>
      </Header>
      <ProductionNav />
      <div className="toolbar">
        <select aria-label="项目范围" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="active">进行中</option>
          <option value="archived">已归档</option>
          <option value="all">全部项目</option>
        </select>
        <input
          aria-label="搜索交付项目"
          className="project-search"
          placeholder="项目名或负责人"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="muted">{list.length} 个交付项目</span>
      </div>
      {data.isPending ? (
        <Loading />
      ) : data.error ? (
        <ErrorState error={data.error} />
      ) : !list.length ? (
        <div className="panel">
          <Empty title="还没有交付项目" description="建立交付目标，再把已有作品归入项目。">
            <button onClick={() => setEditing(true)}>新建交付项目</button>
            <Link className="button" to="/content">
              查看已有作品
            </Link>
          </Empty>
        </div>
      ) : (
        <div className="panel table-scroll">
          <table className="campaign-table">
            <thead>
              <tr>
                {['交付项目', '项目负责人', '交付截止', '交付 / 目标', '阻塞与下一步', '操作'].map(
                  (x) => (
                    <th key={x}>{x}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={'/projects/' + c.id}>
                      <strong>{c.name}</strong>
                    </Link>
                    <small>{c.archived ? '已归档' : '进行中'}</small>
                  </td>
                  <td>{c.ownerName}</td>
                  <td>{c.dueDate ?? '未设置'}</td>
                  <td>
                    <strong>
                      {c.deliveredCount} / {c.targetCount}
                    </strong>
                    <small>{c.workCount} 条作品</small>
                  </td>
                  <td>
                    <span className="pill warning">{c.blockedCount} 条需处理</span>{' '}
                    <span className="pill">{c.reviewCount} 条待审片</span>
                  </td>
                  <td>
                    <Link className="button" to={'/projects/' + c.id}>
                      进入项目
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <CampaignForm
          campaign={editing === true ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
export function CampaignForm({ campaign, onClose }: { campaign?: Campaign; onClose: () => void }) {
  const { client, username } = useWorkspace();
  const cache = useQueryClient();
  const action = useAction();
  return (
    <Modal title={campaign ? '项目设置' : '新建交付项目'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          action.run(async () => {
            const body = {
              name: fd.get('name'),
              ownerName: fd.get('ownerName'),
              dueDate: fd.get('dueDate') || null,
              targetCount: Number(fd.get('targetCount')),
              brief: fd.get('brief'),
              archived: fd.get('archived') === 'on',
              revision: campaign?.revision ?? 0,
            };
            if (campaign) await put(`/clients/${client.id}/campaigns/${campaign.id}`, body);
            else await post(`/clients/${client.id}/campaigns`, body);
            await cache.invalidateQueries({ queryKey: [client.id, 'campaigns'] });
            onClose();
          }, '交付项目已保存');
        }}
      >
        <Field label="项目名称">
          <input name="name" required maxLength={150} defaultValue={campaign?.name} />
        </Field>
        <div className="form-grid">
          <Field label="项目负责人">
            <input
              name="ownerName"
              required
              maxLength={100}
              defaultValue={campaign?.ownerName ?? username}
            />
          </Field>
          <Field label="交付截止">
            <input name="dueDate" type="date" defaultValue={campaign?.dueDate ?? ''} />
          </Field>
          <Field label="目标交付数量">
            <input
              name="targetCount"
              required
              type="number"
              min={1}
              max={10000}
              defaultValue={campaign?.targetCount ?? 10}
            />
          </Field>
        </div>
        <Field label="项目需求">
          <textarea name="brief" maxLength={8000} defaultValue={campaign?.brief ?? ''} />
        </Field>
        {campaign && (
          <label className="checkbox-line">
            <input name="archived" type="checkbox" defaultChecked={campaign.archived} />
            归档项目（保留已有作品与交付）
          </label>
        )}
        {action.error && <ErrorState error={new Error(action.error)} />}
        <button className="primary" disabled={action.busy}>
          保存项目
        </button>
      </form>
    </Modal>
  );
}
export function CampaignDetail() {
  const { id } = useParams();
  const data = useData<Campaign[]>('campaigns', true);
  const campaign = data.data?.find((c) => c.id === id);
  const [editing, setEditing] = useState(false);
  if (data.isPending) return <Loading />;
  if (data.error) return <ErrorState error={data.error} />;
  if (!campaign) return <Empty title="交付项目不存在" description="请返回项目总览。" />;
  return (
    <>
      <Header
        title={campaign.name}
        description={`${campaign.ownerName} · ${campaign.dueDate ?? '未设置截止'} · ${campaign.deliveredCount} / ${campaign.targetCount} 条交付`}
      >
        <button onClick={() => setEditing(true)}>项目设置</button>
        <Link className="button primary" to={'/studio?campaign=' + campaign.id}>
          在此项目做视频
        </Link>
        <Link className="button" to="/">
          返回项目总览
        </Link>
      </Header>
      <div className="project-brief">{campaign.brief || '尚未填写项目需求'}</div>
      <WorkList campaignId={campaign.id} />
      {editing && <CampaignForm campaign={campaign} onClose={() => setEditing(false)} />}
    </>
  );
}
export function Tasks() {
  return (
    <>
      <Header title="我的待办" description="" />
      <ProductionNav />
      <WorkList tasks />
    </>
  );
}
export function WorkList({ campaignId, tasks = false }: { campaignId?: string; tasks?: boolean }) {
  const data = useData<Work[]>('works', true);
  const { username } = useWorkspace();
  const [scope, setScope] = useState(tasks ? 'mine' : 'all');
  const [phase, setPhase] = useState('ALL');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<Work[] | null>(null);
  const [page, setPage] = useState(0);
  const list =
    data.data?.filter(
      (w) =>
        (!campaignId || w.campaignId === campaignId) &&
        (scope === 'all' || scope === 'waiting'
          ? scope === 'all' || w.phase === 'WAITING_SYSTEM'
          : w.assignee === username && w.phase !== 'WAITING_SYSTEM' && w.phase !== 'DELIVERED') &&
        (phase === 'ALL' || w.phase === phase) &&
        `${w.name} ${w.sku}`.includes(query),
    ) ?? [];
  const visible = list.slice(page * 20, page * 20 + 20);
  const safePage = Math.min(page, Math.max(0, Math.ceil(list.length / 20) - 1));
  if (page !== safePage) setPage(safePage);
  return (
    <>
      {tasks && (
        <div className="scope-tabs">
          {[
            ['mine', '我的待办'],
            ['waiting', '等待系统'],
            ['all', '团队作品'],
          ].map(([value, label]) => (
            <button
              className={scope === value ? 'active' : ''}
              key={value}
              onClick={() => {
                setScope(value);
                setPage(0);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="toolbar">
        <select
          aria-label="作品阶段"
          value={phase}
          onChange={(e) => {
            setPhase(e.target.value);
            setPage(0);
          }}
        >
          <option value="ALL">全部阶段</option>
          {Object.entries(phases).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          className="project-search"
          aria-label="搜索作品"
          placeholder="作品名称或 SKU"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <span className="muted">{list.length} 条作品</span>
        {selected.length > 0 && (
          <button onClick={() => setEditing(data.data!.filter((w) => selected.includes(w.id)))}>
            分配 / 改截止（{selected.length}）
          </button>
        )}
      </div>
      {data.isPending ? (
        <Loading />
      ) : data.error ? (
        <ErrorState error={data.error} />
      ) : !list.length ? (
        <div className="panel">
          <Empty title="当前没有作品" description="创建内容，或调整当前筛选范围。" />
        </div>
      ) : (
        <div className="panel table-scroll">
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    aria-label="选择本页作品"
                    type="checkbox"
                    checked={visible.length > 0 && visible.every((w) => selected.includes(w.id))}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...new Set([...selected, ...visible.map((w) => w.id)])]
                          : selected.filter((id) => !visible.some((w) => w.id === id)),
                      )
                    }
                  />
                </th>
                <th>作品 / SKU</th>
                <th>当前阶段</th>
                <th>下一步责任人</th>
                <th>截止</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((w) => (
                <tr key={w.id}>
                  <td>
                    <input
                      aria-label={'选择 ' + w.name}
                      type="checkbox"
                      checked={selected.includes(w.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, w.id]
                            : selected.filter((id) => id !== w.id),
                        )
                      }
                    />
                  </td>
                  <td>
                    <strong>{w.name}</strong>
                    <small>
                      {w.sku || '未填 SKU'} · {w.format} · {w.duration}s
                    </small>
                    {w.note && <small>{w.note}</small>}
                  </td>
                  <td>
                    <span className="pill">{phases[w.phase]}</span>
                  </td>
                  <td>{w.assignee}</td>
                  <td>{w.dueDate ?? '未设置'}</td>
                  <td>
                    <Link className="button" to={'/studio/' + w.id}>
                      打开作品
                    </Link>{' '}
                    <button onClick={() => setEditing([w])}>分工</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pagination">
            <button disabled={!page} onClick={() => setPage(page - 1)}>
              上一页
            </button>
            {page + 1} / {Math.max(1, Math.ceil(list.length / 20))}
            <button disabled={(page + 1) * 20 >= list.length} onClick={() => setPage(page + 1)}>
              下一页
            </button>
          </div>
        </div>
      )}
      {editing && (
        <FlowForm
          works={editing}
          onClose={() => {
            setEditing(null);
            setSelected([]);
          }}
        />
      )}
    </>
  );
}
function FlowForm({ works, onClose }: { works: Work[]; onClose: () => void }) {
  const { client, username } = useWorkspace();
  const cache = useQueryClient();
  const campaigns = useData<Campaign[]>('campaigns');
  const contacts = useData<Contact[]>('team');
  const action = useAction();
  const first = works[0];
  return (
    <Modal title={works.length === 1 ? '作品分工与接力' : '批量分配 / 改截止'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          action.run(async () => {
            await post(`/clients/${client.id}/works/bulk-flow`, {
              items: works.map((w) => ({
                projectId: w.id,
                flow: {
                  campaignId: fd.get('campaignId') || null,
                  assignee: fd.get('assignee'),
                  phase: fd.get('phase'),
                  dueDate: fd.get('dueDate') || null,
                  note: fd.get('note'),
                  revision: w.revision,
                },
              })),
            });
            await cache.invalidateQueries({ queryKey: [client.id] });
            onClose();
          }, '接力状态已保存');
        }}
      >
        <Field label="所属交付项目">
          <select name="campaignId" defaultValue={first.campaignId ?? ''}>
            <option value="">未归入交付项目</option>
            {campaigns.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-grid">
          <Field label="下一步责任人">
            <input
              name="assignee"
              list="team-contacts"
              required
              maxLength={100}
              defaultValue={first.assignee || username}
            />
            <datalist id="team-contacts">
              <option value={username} />
              {contacts.data?.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </Field>
          <Field label="接力阶段">
            <select
              name="phase"
              defaultValue={
                ['WAITING_SYSTEM', 'DELIVERED'].includes(first.phase) ? 'PRODUCTION' : first.phase
              }
            >
              {Object.entries(phases)
                .filter(([k]) => !['WAITING_SYSTEM', 'DELIVERED'].includes(k))
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="截止时间">
            <input name="dueDate" type="date" defaultValue={first.dueDate ?? ''} />
          </Field>
        </div>
        <Field label="时间码 / 问题 / 保留内容">
          <textarea
            name="note"
            maxLength={2000}
            defaultValue={first.note}
            placeholder="例如 00:03 商品颜色需核对，保留口播，交剪辑修改"
          />
        </Field>
        <p className="caption">分工记录不会创建生成任务；实际制作中的作品继续显示为等待系统。</p>
        {action.error && <ErrorState error={new Error(action.error)} />}
        <button disabled={action.busy} className="primary">
          保存接力状态
        </button>
      </form>
    </Modal>
  );
}
