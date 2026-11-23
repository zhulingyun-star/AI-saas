import { X } from 'lucide-react';
import {
  initial,
  roleOf,
  ROLES,
  STATUS_LABEL,
  type Member,
  type Role,
  type Status,
  type TeamClient,
} from './data';

/** 团队管理的小部件：头像、角色标签、状态、角色选择、客户选择。 */

export function Avatar({ name, role, size }: { name: string; role?: string; size?: 'sm' | 'lg' }) {
  return (
    <span
      className={`gy-tm-av${size ? ' ' + size : ''}`}
      style={{ background: roleOf(role).avatar }}
      aria-hidden="true"
    >
      {initial(name)}
    </span>
  );
}

export function RoleTag({ role }: { role: string }) {
  return <span className={`gy-tm-role r-${role.toLowerCase()}`}>{roleOf(role).label}</span>;
}

export function StatusDot({ status }: { status: Status }) {
  return <span className={`gy-tm-st ${status.toLowerCase()}`}>{STATUS_LABEL[status]}</span>;
}

export function PersonCell({
  m,
}: {
  m: Pick<Member, 'displayName' | 'username' | 'role' | 'you'>;
}) {
  return (
    <div className="gy-person">
      <Avatar name={m.displayName} role={m.role} />
      <span className="gy-tm-pname">
        <b>
          {m.displayName}
          {m.you && <span className="gy-tm-you">你</span>}
        </b>
        <small>{m.username}</small>
      </span>
    </div>
  );
}

export function ClientChips({ m, max = 2 }: { m: Member; max?: number }) {
  if (m.allClients)
    return (
      <span className="gy-tm-clients">
        <span>全部客户</span>
      </span>
    );
  if (!m.clients.length) return <span className="gy-muted">还没分客户</span>;
  const shown = m.clients.slice(0, max);
  return (
    <span className="gy-tm-clients">
      {shown.map((c) => (
        <span key={c.id}>{c.name}</span>
      ))}
      {m.clients.length > max && <span className="more">+{m.clients.length - max}</span>}
    </span>
  );
}

export function RolePicker({
  value,
  onChange,
  disabled,
  lockedNote,
}: {
  value: Role;
  onChange: (r: Role) => void;
  disabled?: boolean;
  lockedNote?: string;
}) {
  return (
    <div className="gy-tm-rolepick" role="radiogroup" aria-label="角色">
      {ROLES.map((r) => (
        <button
          key={r.key}
          type="button"
          role="radio"
          aria-checked={r.key === value}
          disabled={disabled && r.key !== value}
          onClick={() => onChange(r.key)}
        >
          <i aria-hidden="true" />
          <span>
            {r.label}
            <small>{r.desc}</small>
          </span>
        </button>
      ))}
      {lockedNote && <small className="gy-muted">{lockedNote}</small>}
    </div>
  );
}

/** 负责的客户：已选的可以移除，下面的下拉加一个 */
export function ClientPicker({
  all,
  value,
  onChange,
  disabled,
}: {
  all: TeamClient[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const left = all.filter((c) => !value.includes(c.id));
  const name = (id: string) => all.find((c) => c.id === id)?.name ?? '已不在团队的客户';
  return (
    <div className="gy-tm-cpick">
      {value.map((id) => (
        <span key={id} className="gy-tag">
          {name(id)}
          {!disabled && (
            <button
              type="button"
              className="x"
              aria-label={`移除 ${name(id)}`}
              onClick={() => onChange(value.filter((x) => x !== id))}
            >
              <X size={12} />
            </button>
          )}
        </span>
      ))}
      {!value.length && <span className="gy-muted">还没分客户，这个人登录后什么客户都进不去</span>}
      {!disabled && left.length > 0 && (
        <select
          aria-label="添加负责的客户"
          value=""
          onChange={(e) => e.target.value && onChange([...value, e.target.value])}
        >
          <option value="">+ 添加客户</option>
          {left.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
