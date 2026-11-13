import { NavLink } from 'react-router-dom';
export default function ResourceNav() {
  return (
    <div className="section-tabs">
      {[
        ['/assets', '商品素材'],
        ['/models', '模特'],
        ['/wardrobe', '服装搭配'],
        ['/voices', '声音'],
        ['/reference', '参考片'],
      ].map(([path, label]) => (
        <NavLink key={path} end to={path}>
          {label}
        </NavLink>
      ))}
    </div>
  );
}
