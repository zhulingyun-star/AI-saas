import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { request } from '../../api';
import { useWorkspace } from '../../components/UI';
import { Card, CardHead } from '../../gy/ui';
import {
  formatRR,
  MODE_LABEL,
  progressLabel,
  projectPath,
  shortTime,
  type ProjectItem,
} from '../projects/data';

/** 商品详情里的「关联项目」：用这个商品（同一组商品图）做的项目。 */
export default function ProductProjects({ anchor }: { anchor: string }) {
  const { client } = useWorkspace();
  const q = useQuery({
    queryKey: [client.id, 'product-projects', anchor],
    queryFn: () =>
      request<ProjectItem[]>(`/clients/${client.id}/product-groups/${anchor}/projects`),
    enabled: !!anchor,
  });
  const list = Array.isArray(q.data) ? q.data : [];
  return (
    <Card pad>
      <CardHead title="关联项目">
        <small>{q.isPending ? '' : `${list.length} 个`}</small>
        <Link className="gy-link" to={`/p/new?product=${anchor}`}>
          <Plus size={12} aria-hidden="true" />
          用这个商品新建项目
        </Link>
      </CardHead>
      {q.isPending ? (
        <span className="gy-muted">正在加载…</span>
      ) : q.error ? (
        <span className="gy-muted">{(q.error as Error).message}</span>
      ) : list.length ? (
        <div className="gy-ruses">
          {list.map((p) => (
            <Link key={p.id} className="it" to={projectPath(p)}>
              {p.name}
              <small>
                {MODE_LABEL[p.mode]} · {formatRR(p)} · {progressLabel(p)[0]} ·{' '}
                {shortTime(p.updatedAt)}
              </small>
            </Link>
          ))}
        </div>
      ) : (
        <span className="gy-muted">还没有项目用这个商品。</span>
      )}
    </Card>
  );
}
