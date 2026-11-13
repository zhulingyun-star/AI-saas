import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Plus,
  Clapperboard,
  FolderInput,
  Layers3,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { Header, useData, useWorkspace, Loading, ErrorState, Empty } from '../components/UI';
import { statusLabel, type Project, type Job } from '../types';
export default function Dashboard() {
  const { client } = useWorkspace();
  const overview = useData<{
    projects: number;
    assets: number;
    activeJobs: number;
    reviews: number;
    events: { actor: string; action: string; detail: string; createdAt: string }[];
  }>('overview', true);
  const projects = useData<Project[]>('projects');
  const jobs = useData<Job[]>('jobs', true);
  if (overview.isPending) return <Loading />;
  if (overview.error) return <ErrorState error={overview.error} retry={() => overview.refetch()} />;
  const d = overview.data!;
  return (
    <>
      <Header
        title="让今天的内容，有序发生。"
        description={`${client.name} / 从商品事实出发，把每一条素材做好。`}
      >
        <Link className="button primary" to="/studio">
          <Plus size={16} />
          新建内容
        </Link>
      </Header>
      <section className="stats">
        {[
          ['内容项目', d.projects, '项目与脚本'],
          ['素材资产', d.assets, '团队上传的真实文件'],
          ['正在制作', d.activeJobs, '已提交的粗剪任务'],
          ['等待审核', d.reviews, '下一步待办'],
        ].map(([label, num, desc]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{num.toString().padStart(2, '0')}</strong>
            <small>{desc}</small>
          </div>
        ))}
      </section>
      <div className="dashboard-grid">
        <section>
          <div className="section-heading">
            <h2>开始一条好内容</h2>
            <span className="muted">少一点重复，多一点确定</span>
          </div>
          <div className="start-card">
            <div>
              <span className="eyebrow">YOUR NEXT PRODUCTION</span>
              <h2>
                商品准备好了，
                <br />
                让脚本接着往下走。
              </h2>
              <p>
                确认事实、选择拍法、逐镜编排。
                <br />
                每一步都留有依据，每一版都能回看。
              </p>
              <Link to="/studio" className="text-link">
                做一条素材 <ArrowRight size={16} />
              </Link>
            </div>
            <div className="product-stack">
              <img src="/demo/fashion.jpg" alt="服饰素材示例" />
              <span>PRODUCT / STORY / FRAME</span>
              <div className="frame-label">
                01 <Clapperboard size={16} /> 建立你的镜头单
              </div>
            </div>
          </div>
          <div className="quick-links">
            <Link to="/assets">
              <FolderInput size={21} />
              <div>
                准备商品素材<small>图片、视频与商品证据</small>
              </div>
              <ArrowUpRight size={17} />
            </Link>
            <Link to="/batch">
              <Layers3 size={21} />
              <div>
                批量安排内容<small>组合商品、拍法与开场</small>
              </div>
              <ArrowUpRight size={17} />
            </Link>
          </div>
          <section className="panel">
            <div className="panel-heading">
              <h2>最近的内容项目</h2>
              <Link to="/studio" className="text-link">
                新建 <Plus size={14} />
              </Link>
            </div>
            {projects.data?.length ? (
              <div className="project-list">
                {projects.data.slice(0, 6).map((p, i) => (
                  <Link to={'/studio/' + p.id} key={p.id}>
                    <span className="project-index">{String(i + 1).padStart(2, '0')}</span>
                    <div>
                      <strong>{p.name}</strong>
                      <small>
                        {p.sku || '未填 SKU'} · {p.format} · {p.duration}s
                      </small>
                    </div>
                    <span className="pill">{statusLabel[p.status]}</span>
                    <ArrowUpRight size={16} />
                  </Link>
                ))}
              </div>
            ) : (
              <Empty
                title="第一条内容，从这里开始"
                description="上传商品素材，再确认一份可执行的分镜脚本。"
              >
                <Link className="button" to="/studio">
                  创建内容项目
                </Link>
              </Empty>
            )}
          </section>
        </section>
        <aside className="dashboard-aside">
          <section className="panel">
            <div className="panel-heading">
              <h2>接下来要做</h2>
              <span className="pill">{d.reviews + d.activeJobs}</span>
            </div>
            {jobs.data?.filter((j) => ['REVIEW', 'RUNNING', 'QUEUED'].includes(j.status)).length ? (
              jobs.data
                .filter((j) => ['REVIEW', 'RUNNING', 'QUEUED'].includes(j.status))
                .slice(0, 5)
                .map((j) => (
                  <Link
                    className="todo"
                    key={j.id}
                    to={j.status === 'REVIEW' ? '/review' : '/queue'}
                  >
                    <CheckCircle2 size={17} />
                    <div>
                      <strong>{j.name}</strong>
                      <small>
                        {statusLabel[j.status]} · V{j.revision}
                      </small>
                    </div>
                  </Link>
                ))
            ) : (
              <div className="quiet-empty">
                <CheckCircle2 size={24} />
                <p>没有积压的制作任务</p>
                <small>开始新项目后，在这里接着做。</small>
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>工作空间动态</h2>
            </div>
            <div className="activity">
              {d.events.map((event, i) => (
                <div key={i}>
                  <i />
                  <div>
                    <strong>{event.action}</strong>
                    <p>{event.detail}</p>
                    <small>
                      {event.actor} ·{' '}
                      {new Date(event.createdAt + 'Z').toLocaleString('zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <div className="note">
            <span>制作原则 / 01</span>
            <p>
              先把商品讲清楚，
              <br />
              再把画面做好看。
            </p>
            <small>未确认的性能与功效，不进入脚本。</small>
          </div>
        </aside>
      </div>
    </>
  );
}
