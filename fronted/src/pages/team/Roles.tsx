import { useState } from 'react';
import { Card, PageHead } from '../../gy/ui';
import { ROLES, useTeam } from './data';
import { Avatar, RoleTag } from './parts';

/**
 * 角色与权限：五个角色能做什么。表里每一行都是后端真正拦的规则（RoleGuard / TeamService），
 * 没有在后端生效的权限不写进来。
 */
type Cell = 'y' | 'n' | string;
const ROWS: [string, [string, Cell[]][]][] = [
  [
    '客户空间',
    [
      ['能进哪些客户', ['全部', '分给他的', '分给他的', '分给他的', '分给他的']],
      ['查看商品、项目、参考视频和资产库', ['y', 'y', 'y', 'y', 'y']],
      ['新建项目、改分镜、出片、上传素材', ['y', 'y', 'y', 'y', 'n']],
      ['审片，标记可投放', ['y', 'y', 'y', 'n', 'n']],
      ['填写、导入投放数据', ['y', 'y', 'y', '只看', '只看']],
      ['修改客户知识', ['y', 'y', 'n', 'n', 'n']],
    ],
  ],
  [
    '团队管理',
    [
      ['查看成员和工作负荷', ['y', 'y', 'y', 'y', 'y']],
      ['开通、停用成员，改角色和负责的客户', ['y', 'n', 'n', 'n', 'n']],
      ['新建客户', ['y', 'n', 'n', 'n', 'n']],
    ],
  ],
];

export default function Roles() {
  const team = useTeam();
  const [sel, setSel] = useState<number | null>(null);
  const members = (team.data?.members ?? []).filter((m) => m.status !== 'DISABLED');
  return (
    <div className="gy-page gy-new">
      <PageHead
        title="角色与权限"
        description="五个角色分别能做什么。新增成员时选一个角色即可。点角色卡片，下面表格会标出这一列。"
      />
      <div className="gy-tm-rcards">
        {ROLES.map((r, i) => {
          const ms = members.filter((m) => m.role === r.key);
          return (
            <button
              key={r.key}
              type="button"
              className="gy-card gy-tm-rcard"
              aria-pressed={sel === i}
              onClick={() => setSel(sel === i ? null : i)}
            >
              <RoleTag role={r.key} />
              <p>{r.desc}</p>
              <span className="ft">
                <span className="gy-tm-stack">
                  {ms.slice(0, 3).map((m) => (
                    <Avatar key={m.username} name={m.displayName} role={m.role} size="sm" />
                  ))}
                </span>
                {team.data ? `${ms.length} 人` : ''}
              </span>
            </button>
          );
        })}
      </div>
      <Card className={`gy-table-wrap gy-tm-matrix${sel != null ? ` hl-${sel + 2}` : ''}`}>
        <table>
          <thead>
            <tr>
              <th>能做什么</th>
              {ROLES.map((r) => (
                <th key={r.key}>{r.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([group, rows]) => (
              <RowGroup key={group} group={group} rows={rows} />
            ))}
          </tbody>
        </table>
      </Card>
      <p className="gy-goods-foot">
        这些规则在后台执行：没有权限的操作就算绕过页面直接请求也会被拒绝。停用的账号什么都做不了。
      </p>
    </div>
  );
}

function RowGroup({ group, rows }: { group: string; rows: [string, Cell[]][] }) {
  return (
    <>
      <tr>
        <td className="grp" colSpan={6}>
          {group}
        </td>
      </tr>
      {rows.map(([label, cells]) => (
        <tr key={label}>
          <td>{label}</td>
          {cells.map((c, i) => (
            <td key={i} className={c === 'y' ? 'y' : c === 'n' ? 'n' : c === '只看' ? 'p' : 't'}>
              {c === 'y' ? '✓' : c === 'n' ? '—' : c}
              {(c === 'y' || c === 'n') && (
                <span className="gy-sr">{c === 'y' ? '可以' : '不可以'}</span>
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
