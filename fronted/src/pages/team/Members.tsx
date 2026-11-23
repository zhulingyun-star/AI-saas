import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound, MoreHorizontal, Plus, Users, X } from 'lucide-react';
import { put } from '../../api';
import { useWorkspace } from '../../components/UI';
import {
  Btn,
  Card,
  Chip,
  Dialog,
  EmptyState,
  Field,
  Notice,
  PageHead,
  SearchBox,
} from '../../gy/ui';
import {
  ROLES,
  roleOf,
  useMe,
  useTeam,
  useTeamEvents,
  useTeamRefresh,
  when,
  withinDays,
  type Member,
  type Role,
  type TeamData,
} from './data';
import {
  Avatar,
  ClientChips,
  ClientPicker,
  PersonCell,
  RolePicker,
  RoleTag,
  StatusDot,
} from './parts';

/** 团队管理 · 成员与权限：成员列表，点一行在右边改角色和负责的客户、停用、重设密码（只有管理员能改，后端也会拦）。 */
export default function Members() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const team = useTeam();
  const me = useMe();
  const canManage = !!team.data?.canManage;
  const events = useTeamEvents(canManage);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [ownPw, setOwnPw] = useState(false);
  const open = params.get('m');
  const setOpen = (u: string | null) => {
    const next = new URLSearchParams(params);
    if (u) next.set('m', u);
    else next.delete('m');
    setParams(next, { replace: true });
  };
  const data = team.data;
  const members = data?.members ?? [];
  const q = query.trim().toLowerCase();
  const rows = members.filter(
    (m) =>
      (!role || m.role === role) &&
      (!q || `${m.displayName} ${m.username}`.toLowerCase().includes(q)),
  );
  const count = (s: Member['status']) => members.filter((m) => m.status === s).length;
  const active = members.filter((m) => m.status !== 'DISABLED');
  const clientsWithoutLead = (data?.clients ?? []).filter(
    (c) => !active.some((m) => m.role === 'LEAD' && m.clients.some((x) => x.id === c.id)),
  );
  const selected = members.find((m) => m.username === open);

  return (
    <div className="gy-page gy-new">
      <PageHead
        title="成员与权限"
        description="账号由管理员开通。管理员能进全部客户，其他人只能进分给他的客户；角色决定在客户里能改什么。"
      >
        {me.data?.status && (
          <Btn onClick={() => setOwnPw(true)}>
            <KeyRound size={14} aria-hidden="true" />
            改我的密码
          </Btn>
        )}
        {canManage && (
          <Btn variant="primary" onClick={() => navigate('/team/new')}>
            <Plus size={14} aria-hidden="true" />
            新增成员
          </Btn>
        )}
      </PageHead>
      {team.error ? (
        <Notice tone="error" title="成员列表没读出来">
          {(team.error as Error).message}
        </Notice>
      ) : !data ? (
        <Card pad>
          <span className="gy-muted">正在读取成员…</span>
        </Card>
      ) : (
        <>
          {!canManage && (
            <Notice tone="info">
              你是{roleOf(me.data?.role).label}
              ，可以看团队成员；开通成员、改角色和负责的客户要找管理员。
            </Notice>
          )}
          <div className="gy-tm-kpis">
            <Card className="gy-tm-kpi">
              <span>成员</span>
              <b>
                {members.length}
                <small>人</small>
              </b>
              <span className="s">
                正常 {count('ACTIVE')} · 待首次登录 {count('PENDING')} · 已停用 {count('DISABLED')}
              </span>
            </Card>
            <Card className="gy-tm-kpi">
              <span>客户</span>
              <b>
                {data.clients.length}
                <small>个</small>
              </b>
              <span className="s">
                {!data.clients.length
                  ? '还没有客户'
                  : clientsWithoutLead.length
                    ? `${clientsWithoutLead.length} 个还没有客户负责人，由管理员兼管`
                    : '都有客户负责人'}
              </span>
            </Card>
            <Card className="gy-tm-kpi">
              <span>最近 7 天登录过</span>
              <b>
                {active.filter((m) => withinDays(m.lastLoginAt, 7)).length}
                <small>人</small>
              </b>
              <span className="s">在用的账号 {active.length} 个</span>
            </Card>
            <Card className="gy-tm-kpi">
              <span>管理员</span>
              <b>
                {active.filter((m) => m.role === 'ADMIN').length}
                <small>人</small>
              </b>
              <span className="s">能开通成员、改角色和新建客户</span>
            </Card>
          </div>
          <div className="gy-toolbar">
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="搜索姓名或登录账号"
              label="搜索成员"
            />
            <div className="gy-cats" role="group" aria-label="角色筛选">
              <Chip pressed={!role} count={members.length} onClick={() => setRole('')}>
                全部
              </Chip>
              {ROLES.map((r) => (
                <Chip
                  key={r.key}
                  pressed={role === r.key}
                  count={members.filter((m) => m.role === r.key).length}
                  onClick={() => setRole(role === r.key ? '' : r.key)}
                >
                  {r.label}
                </Chip>
              ))}
            </div>
          </div>
          <Card className="gy-table-wrap">
            <table className="gy-goods gy-tm-table">
              <thead>
                <tr>
                  <th>成员</th>
                  <th>角色</th>
                  <th>负责的客户</th>
                  <th>最近登录</th>
                  <th>状态</th>
                  <th aria-label="操作" />
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr
                    key={m.username}
                    tabIndex={0}
                    aria-label={`查看成员 ${m.displayName}`}
                    className={m.username === open ? 'on' : undefined}
                    onClick={() => setOpen(m.username)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setOpen(m.username);
                    }}
                  >
                    <td>
                      <PersonCell m={m} />
                    </td>
                    <td data-label="角色">
                      <RoleTag role={m.role} />
                      {m.owner && <small className="gy-muted">团队主账号</small>}
                    </td>
                    <td data-label="负责的客户">
                      <ClientChips m={m} />
                    </td>
                    <td className="gy-muted" data-label="最近登录">
                      {when(m.lastLoginAt, '还没登录过')}
                    </td>
                    <td data-label="状态">
                      <StatusDot status={m.status} />
                    </td>
                    <td className="gy-tm-more">
                      <button
                        type="button"
                        className="gy-icon-btn"
                        aria-label={`${canManage ? '编辑' : '查看'} ${m.displayName}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpen(m.username);
                        }}
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td
                      colSpan={6}
                      className="gy-muted"
                      style={{ textAlign: 'center', padding: 40 }}
                    >
                      没有找到匹配的成员
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
          {members.length <= 1 && (
            <Card>
              <EmptyState title="团队里还只有你一个人" icon={<Users size={22} />}>
                <span>
                  {canManage
                    ? '点「新增成员」给同事开通账号，选好角色和负责的客户，对方用你告诉他的初始密码登录。'
                    : '等管理员开通同事的账号后，会显示在这里。'}
                </span>
              </EmptyState>
            </Card>
          )}
          {canManage && !!events.data?.length && (
            <Card className="gy-tm-events">
              <h3>最近的成员变更</h3>
              <ul>
                {events.data.slice(0, 8).map((e, i) => (
                  <li key={i}>
                    <span className="gy-muted">{when(e.createdAt)}</span>
                    <span>
                      <b>{e.actor}</b> {e.action} <b>{e.target}</b>
                    </span>
                    <small className="gy-muted">{e.detail}</small>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
      {selected && data && (
        <MemberDrawer
          key={`${selected.username}:${selected.revision}`}
          m={selected}
          data={data}
          onClose={() => setOpen(null)}
        />
      )}
      {ownPw && <OwnPassword onClose={() => setOwnPw(false)} />}
    </div>
  );
}

/** 右侧抽屉：保存 / 取消放在抽屉顶部的操作条；停用和重设密码在下面「账号」一栏，各自再确认一次。 */
function MemberDrawer({ m, data, onClose }: { m: Member; data: TeamData; onClose: () => void }) {
  const { notify } = useWorkspace();
  const refresh = useTeamRefresh();
  const can = data.canManage;
  const [name, setName] = useState(m.displayName);
  const [role, setRole] = useState<Role>(m.role);
  const [clients, setClients] = useState(m.clients.map((c) => c.id));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState<'status' | 'password' | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirm) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirm, onClose]);
  const roleLocked = m.owner
    ? '团队主账号一直是管理员'
    : m.you
      ? '不能改自己的角色，请让另一位管理员来改'
      : '';
  const dirty =
    name.trim() !== m.displayName ||
    role !== m.role ||
    (role !== 'ADMIN' && clients.join() !== m.clients.map((c) => c.id).join());
  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      await put(`/team/members/${encodeURIComponent(m.username)}`, {
        displayName: name.trim(),
        role,
        clientIds: role === 'ADMIN' ? [] : clients,
        revision: m.revision,
      });
      await refresh();
      notify(`已保存 ${name.trim()} 的设置`);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="gy-new">
      <div className="gy-drawer-bg" onMouseDown={onClose} />
      <aside
        className="gy-drawer gy-tm-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${can ? '编辑' : '查看'}成员 ${m.displayName}`}
      >
        <div className="gy-tm-dh">
          <Avatar name={m.displayName} role={m.role} size="lg" />
          <span>
            <b>{m.displayName}</b>
            <small>登录账号 {m.username}</small>
            <small>
              最近登录 {when(m.lastLoginAt, '还没登录过')} · <StatusDot status={m.status} />
            </small>
          </span>
          <button type="button" className="gy-icon-btn" aria-label="关闭" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        {can && (
          <div className="gy-tm-dbar" role="toolbar" aria-label="保存成员设置">
            <span className="gy-muted">{dirty ? '有改动还没保存' : '改完点保存'}</span>
            <Btn variant="ghost" onClick={onClose}>
              取消
            </Btn>
            <Btn variant="primary" busy={busy} disabled={!dirty || !name.trim()} onClick={save}>
              保存
            </Btn>
          </div>
        )}
        <div className="gy-drawer-body gy-tm-db">
          {err && <Notice tone="error">{err}</Notice>}
          {!can && <Notice tone="info">只有管理员能改成员设置，这里只能看。</Notice>}
          {can && (
            <Field label="姓名" htmlFor="tm-name">
              <input
                id="tm-name"
                className="gy-input"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          )}
          <div>
            <span className="gy-label">角色</span>
            <RolePicker
              value={role}
              onChange={setRole}
              disabled={!can || !!roleLocked}
              lockedNote={can ? roleLocked : ''}
            />
          </div>
          <div>
            <span className="gy-label">负责的客户</span>
            {role === 'ADMIN' ? (
              <span className="gy-muted">
                管理员能进团队的全部客户（{data.clients.length} 个），不用单独分配。
              </span>
            ) : (
              <ClientPicker
                all={data.clients}
                value={clients}
                onChange={setClients}
                disabled={!can}
              />
            )}
          </div>
          {can && !m.you && !m.owner && (
            <div className="gy-tm-acct">
              <span className="gy-label">账号</span>
              <div className="gy-row">
                <Btn size="xs" onClick={() => setConfirm('password')}>
                  重设密码
                </Btn>
                <Btn
                  size="xs"
                  variant="ghost"
                  danger={m.status !== 'DISABLED'}
                  onClick={() => setConfirm('status')}
                >
                  {m.status === 'DISABLED' ? '重新启用' : '停用账号'}
                </Btn>
              </div>
              <small className="gy-muted">
                停用后这个账号登录不了，也进不了任何客户；做过的项目和记录都保留。
              </small>
            </div>
          )}
        </div>
      </aside>
      {confirm === 'status' && <StatusConfirm m={m} onClose={() => setConfirm(null)} />}
      {confirm === 'password' && <ResetPassword m={m} onClose={() => setConfirm(null)} />}
    </div>
  );
}

function StatusConfirm({ m, onClose }: { m: Member; onClose: () => void }) {
  const { notify } = useWorkspace();
  const refresh = useTeamRefresh();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const enable = m.status === 'DISABLED';
  const go = async () => {
    setBusy(true);
    setErr('');
    try {
      await put(`/team/members/${encodeURIComponent(m.username)}/status`, {
        enabled: enable,
        revision: m.revision,
      });
      await refresh();
      notify(enable ? `已重新启用 ${m.displayName}` : `已停用 ${m.displayName}`);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={enable ? `重新启用 ${m.displayName}` : `停用 ${m.displayName}`}
      onClose={onClose}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            取消
          </Btn>
          <Btn variant="primary" danger={!enable} busy={busy} onClick={go}>
            {enable ? '重新启用' : '停用'}
          </Btn>
        </>
      }
    >
      {err && <Notice tone="error">{err}</Notice>}
      <p>
        {enable
          ? '启用后可以用原来的密码登录，负责的客户和角色不变。'
          : '停用后马上登录不了，已经打开的页面也读不到客户数据。项目、成片和记录都保留，可以随时重新启用。'}
      </p>
    </Dialog>
  );
}

function ResetPassword({ m, onClose }: { m: Member; onClose: () => void }) {
  const { notify } = useWorkspace();
  const refresh = useTeamRefresh();
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const bad = pw.length < 12 ? '至少 12 位' : pw !== again ? '两次输入的不一样' : '';
  const go = async () => {
    setBusy(true);
    setErr('');
    try {
      await put(`/team/members/${encodeURIComponent(m.username)}/password`, {
        password: pw,
        revision: m.revision,
      });
      await refresh();
      notify(`已重设 ${m.displayName} 的密码`);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={`重设 ${m.displayName} 的密码`}
      onClose={onClose}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            取消
          </Btn>
          <Btn variant="primary" busy={busy} disabled={!!bad} onClick={go}>
            重设密码
          </Btn>
        </>
      }
    >
      {err && <Notice tone="error">{err}</Notice>}
      <Field label="新密码（至少 12 位）" htmlFor="tm-rpw">
        <input
          id="tm-rpw"
          className="gy-input"
          type="password"
          autoComplete="new-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
      </Field>
      <Field label="再输一次" htmlFor="tm-rpw2">
        <input
          id="tm-rpw2"
          className="gy-input"
          type="password"
          autoComplete="new-password"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
        />
      </Field>
      <small className="gy-muted">
        {pw && bad ? bad : '保存后不会再显示，请用安全的方式告诉对方；对方登录后可以自己改。'}
      </small>
    </Dialog>
  );
}

function OwnPassword({ onClose }: { onClose: () => void }) {
  const { notify } = useWorkspace();
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const bad = !cur
    ? '先输入现在的密码'
    : pw.length < 12
      ? '新密码至少 12 位'
      : pw !== again
        ? '两次输入的新密码不一样'
        : '';
  const go = async () => {
    setBusy(true);
    setErr('');
    try {
      await put('/team/me/password', { current: cur, next: pw });
      notify('密码已修改，下次登录用新密码');
      onClose();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="改我的密码"
      onClose={onClose}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            取消
          </Btn>
          <Btn variant="primary" busy={busy} disabled={!!bad} onClick={go}>
            修改密码
          </Btn>
        </>
      }
    >
      {err && <Notice tone="error">{err}</Notice>}
      <Field label="现在的密码" htmlFor="tm-cur">
        <input
          id="tm-cur"
          className="gy-input"
          type="password"
          autoComplete="current-password"
          value={cur}
          onChange={(e) => setCur(e.target.value)}
        />
      </Field>
      <Field label="新密码（至少 12 位）" htmlFor="tm-new">
        <input
          id="tm-new"
          className="gy-input"
          type="password"
          autoComplete="new-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
      </Field>
      <Field label="再输一次新密码" htmlFor="tm-new2">
        <input
          id="tm-new2"
          className="gy-input"
          type="password"
          autoComplete="new-password"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
        />
      </Field>
      {(cur || pw) && bad && <small className="gy-muted">{bad}</small>}
    </Dialog>
  );
}
