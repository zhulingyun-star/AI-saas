import { Link, useLocation } from 'react-router-dom';
import { ChartNoAxesColumn, KeyRound, Plus, Users, UserRound } from 'lucide-react';
import { ROLES, useMe, useTeam } from './data';

/** 团队管理左栏：成员与权限、角色与权限、工作负荷，下面是以前的分工联系人。 */
export default function TeamSidebar() {
  const { pathname } = useLocation();
  const team = useTeam();
  const me = useMe();
  const members = team.data?.members ?? [];
  const views: [string, string, typeof Users, number | null][] = [
    ['/team', '成员与权限', Users, team.data ? members.length : null],
    ['/team/roles', '角色与权限', KeyRound, ROLES.length],
    ['/team/workload', '工作负荷', ChartNoAxesColumn, null],
  ];
  return (
    <>
      {me.data?.canManage && (
        <Link className="gy-side-new" to="/team/new" title="新增成员">
          <Plus size={16} aria-hidden="true" />
          <span className="lbl">新增成员</span>
        </Link>
      )}
      <nav className="gy-snav" aria-label="团队管理">
        <div className="g">成员</div>
        {views.map(([to, label, Icon, n]) => (
          <Link
            key={to}
            to={to}
            title={label}
            aria-current={
              pathname === to || (to === '/team' && pathname === '/team/new') ? 'page' : undefined
            }
          >
            <Icon size={16} aria-hidden="true" />
            <span className="lbl">{label}</span>
            {n != null && <span className="n">{n}</span>}
          </Link>
        ))}
        <div className="g">以前的页面</div>
        <Link
          to="/team/contacts"
          title="分工联系人"
          aria-current={pathname === '/team/contacts' ? 'page' : undefined}
        >
          <UserRound size={16} aria-hidden="true" />
          <span className="lbl">分工联系人</span>
        </Link>
      </nav>
      <div className="gy-side-foot">
        <b>团队</b>
        {team.data
          ? `${members.filter((m) => m.status !== 'DISABLED').length} 位在用的成员 · ${team.data.clients.length} 个客户`
          : '正在读取成员'}
      </div>
    </>
  );
}
