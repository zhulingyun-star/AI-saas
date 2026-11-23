import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../../api';
import { useWorkspace } from '../../components/UI';
import { Btn, Card, Field, Notice, PageHead } from '../../gy/ui';
import { TopBar } from '../projects/parts';
import { roleOf, useTeam, useTeamRefresh, type Member, type Role } from './data';
import { ClientPicker, RolePicker } from './parts';

/** 新增成员：填姓名、登录账号、初始密码，选角色和负责的客户。「开通账号」在顶部操作条。 */
export default function MemberNew() {
  const navigate = useNavigate();
  const { notify } = useWorkspace();
  const team = useTeam();
  const refresh = useTeamRefresh();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [role, setRole] = useState<Role>('MAKER');
  const [clients, setClients] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const data = team.data;
  const problems = [
    !name.trim() && '填姓名',
    !/^[A-Za-z0-9][A-Za-z0-9._@-]{2,59}$/.test(username.trim()) &&
      '登录账号用 3 到 60 位英文字母、数字或 . _ @ -',
    pw.length < 12 && '初始密码至少 12 位',
    pw.length >= 12 && pw !== again && '两次输入的密码不一样',
  ].filter(Boolean) as string[];
  const create = async () => {
    setBusy(true);
    setErr('');
    try {
      const m = await post<Member>('/team/members', {
        username: username.trim(),
        displayName: name.trim(),
        role,
        clientIds: role === 'ADMIN' ? [] : clients,
        password: pw,
      });
      setPw('');
      setAgain('');
      await refresh();
      notify(`已开通 ${m.displayName} 的账号`);
      navigate(`/team?m=${encodeURIComponent(m.username)}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  if (data && !data.canManage)
    return (
      <div className="gy-page gy-new">
        <PageHead title="新增成员" />
        <Notice tone="warn" title="只有管理员能开通成员">
          找团队管理员帮你开通同事的账号。
        </Notice>
      </div>
    );
  return (
    <div className="gy-page gy-new gy-tm-new">
      <PageHead
        title="新增成员"
        description="给同事开通账号。初始密码由你定，开通后不会再显示；对方第一次登录后可以自己改。"
      />
      <TopBar
        actions={
          <>
            <Btn variant="ghost" onClick={() => navigate('/team')}>
              取消
            </Btn>
            <Btn
              variant="primary"
              busy={busy}
              disabled={!!problems.length || !data}
              onClick={create}
            >
              开通账号
            </Btn>
          </>
        }
      >
        {problems.length ? `还差：${problems.join('、')}` : `开通一个「${roleOf(role).label}」账号`}
      </TopBar>
      {err && <Notice tone="error">{err}</Notice>}
      <div className="gy-tm-newgrid">
        <Card pad className="gy-tm-form">
          <h3>账号</h3>
          <Field label="姓名" required htmlFor="tm-n-name">
            <input
              id="tm-n-name"
              className="gy-input"
              maxLength={60}
              value={name}
              placeholder="例如：赵琳"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="登录账号" required htmlFor="tm-n-user">
            <input
              id="tm-n-user"
              className="gy-input"
              maxLength={60}
              autoComplete="off"
              value={username}
              placeholder="英文字母或数字，例如 zhaolin"
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label="初始密码（至少 12 位）" required htmlFor="tm-n-pw">
            <input
              id="tm-n-pw"
              className="gy-input"
              type="password"
              autoComplete="new-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
          </Field>
          <Field label="再输一次初始密码" required htmlFor="tm-n-pw2">
            <input
              id="tm-n-pw2"
              className="gy-input"
              type="password"
              autoComplete="new-password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
            />
          </Field>
          <small className="gy-muted">
            密码只用来登录，系统只存加密后的结果，任何页面都看不到。请当面或用安全的方式告诉对方。
          </small>
        </Card>
        <Card pad className="gy-tm-form">
          <h3>角色和负责的客户</h3>
          <RolePicker value={role} onChange={setRole} />
          <div>
            <span className="gy-label">负责的客户</span>
            {role === 'ADMIN' ? (
              <span className="gy-muted">管理员能进团队的全部客户，不用单独分配。</span>
            ) : data ? (
              data.clients.length ? (
                <ClientPicker all={data.clients} value={clients} onChange={setClients} />
              ) : (
                <span className="gy-muted">团队还没有客户。先在右上角新建客户，再回来分配。</span>
              )
            ) : (
              <span className="gy-muted">正在读取客户…</span>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
