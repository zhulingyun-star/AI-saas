import { NavLink } from 'react-router-dom';
export function ProductionNav() {
  return (
    <div className="section-tabs">
      {[
        ['/', '项目总览'],
        ['/tasks', '我的待办'],
        ['/queue', '生成任务'],
        ['/review', '审片交付'],
        ['/content', '快捷制作'],
        ['/gallery', '样片广场'],
      ].map(([path, label]) => (
        <NavLink key={path} end to={path}>
          {label}
        </NavLink>
      ))}
    </div>
  );
}
