import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Header, Empty, ErrorState, Loading, useData } from '../components/UI';
import ProjectVideoStart from '../components/ProjectVideoStart';
import type { Campaign } from '../types';

export default function ProjectEcommerceStart() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const campaigns = useData<Campaign[]>('campaigns');
  if (campaigns.isPending) return <Loading />;
  if (campaigns.error) return <ErrorState error={campaigns.error} />;
  const campaign = campaigns.data?.find(item => item.id === id);
  if (!campaign) return <Empty title="交付项目不存在" description="返回项目总览重新打开。" />;
  const mode = params.get('mode') === 'one-click' ? 'ONE_CLICK' : 'FRAMEWORK';
  return <>
    <Header title="电商短视频" description={`${campaign.name} · ${mode === 'FRAMEWORK' ? '框架模式' : '一键成片'}`}>
      <Link className="button" to={`/projects/${id}`}>返回项目</Link>
    </Header>
    <ProjectVideoStart key={`${id}:${mode}`} campaign={campaign} productionMode={mode} />
  </>;
}
