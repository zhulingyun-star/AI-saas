import { useSearchParams } from 'react-router-dom';
import { ProductionNav } from '../components/ProductionNav';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, Search, RefreshCw } from 'lucide-react';
import {
  Header,
  Empty,
  Field,
  Modal,
  useData,
  useWorkspace,
  useAction,
  Loading,
  ErrorState,
} from '../components/UI';
import { jobUrl, request, post } from '../api';
import { statusLabel, type Job, type Review, type Project } from '../types';
export default function Queue({ reviewOnly = false }: { reviewOnly?: boolean }) {
  const data = useData<Job[]>('jobs', true);
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Job | null>(null);
  const [page, setPage] = useState(0);
  const filtered =
    data.data?.filter(
      (j) =>
        (!reviewOnly || ['REVIEW', 'CHANGES_REQUESTED', 'DELIVERED'].includes(j.status)) &&
        (status === 'ALL' || j.status === status) &&
        j.name.includes(search),
    ) ?? [];
  return (
    <>
      <Header
        title={reviewOnly ? '审片与交付' : '生成任务'}
        description={
          reviewOnly
            ? '按时间码记录问题，核对实际文件，再确认这一版的交付。'
            : '每一条制作任务都有冻结的脚本、明确的状态与版本。'
        }
      >
        <button onClick={() => data.refetch()}>
          <RefreshCw size={16} />
          刷新状态
        </button>
        <Link className="button primary" to="/studio">
          新建内容
        </Link>
      </Header>
      <ProductionNav />
      <div className="toolbar">
        <div className="search">
          <Search size={17} />
          <input
            aria-label="搜索产单"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="搜索内容名称"
          />
        </div>
        <select
          aria-label="产单状态"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          <option value="ALL">全部状态</option>
          {Object.entries(statusLabel)
            .filter(([k]) => !['DRAFT', 'SCRIPT_READY'].includes(k))
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
        </select>
        <span className="muted">共 {filtered.length} 条 · 自动更新</span>
      </div>
      {data.isPending ? (
        <Loading />
      ) : data.error ? (
        <ErrorState error={data.error} />
      ) : !filtered.length ? (
        <section className="panel">
          <Empty
            title={reviewOnly ? '暂无待审片的产单' : '制作队列还是空的'}
            description="完成脚本后提交本地粗剪，制作结果会在这里流转。"
          >
            <Link className="button" to="/studio">
              去做一条素材
            </Link>
          </Empty>
        </section>
      ) : (
        <div className="panel table-scroll">
          <table>
            <thead>
              <tr>
                <th>内容与版本</th>
                <th>制作方式</th>
                <th>状态</th>
                <th>进度 / 说明</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(page * 10, (page + 1) * 10).map((j) => (
                <tr key={j.id}>
                  <td>
                    <strong>{j.name}</strong>
                    <small>
                      V{j.revision} · {j.id.slice(0, 8)}
                    </small>
                  </td>
                  <td>{j.provider === 'LOCAL' ? '本地素材粗剪' : '外部视频 API'}</td>
                  <td>
                    <span
                      className={`pill ${j.status === 'DELIVERED' ? 'good' : ['FAILED', 'BLOCKED'].includes(j.status) ? 'warning' : ''}`}
                    >
                      {statusLabel[j.status]}
                    </span>
                  </td>
                  <td className="progress-cell">
                    {['QUEUED', 'RUNNING'].includes(j.status) && (
                      <progress max={100} value={j.progress} />
                    )}
                    <small>{j.message}</small>
                  </td>
                  <td>
                    <button onClick={() => setSelected(j)}>
                      {j.hasOutput ? '查看与审片' : '查看详情'}
                      <ExternalLink size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pagination">
            <button disabled={page === 0} onClick={() => setPage(page - 1)}>
              上一页
            </button>
            <span>
              {page + 1} / {Math.ceil(filtered.length / 10)}
            </span>
            <button disabled={(page + 1) * 10 >= filtered.length} onClick={() => setPage(page + 1)}>
              下一页
            </button>
          </div>
        </div>
      )}
      {(selected || data.data?.find((j) => j.id === params.get('job'))) && (
        <ReviewDialog
          job={data.data?.find((j) => j.id === (selected?.id ?? params.get('job'))) ?? selected!}
          onClose={() => {
            setSelected(null);
            setParams({});
          }}
        />
      )}
    </>
  );
}
function ReviewDialog({ job, onClose }: { job: Job; onClose: () => void }) {
  const { client } = useWorkspace();
  const cache = useQueryClient();
  const action = useAction();
  const [time, setTime] = useState(0);
  const [decision, setDecision] = useState('COMMENT');
  const [comment, setComment] = useState('');
  const reviews = useQuery({
    queryKey: [client.id, 'reviews', job.id],
    queryFn: () => request<Review[]>(`/clients/${client.id}/jobs/${job.id}/reviews`),
  });
  const script = useQuery({
    queryKey: [client.id, 'job-script', job.id],
    queryFn: () => request<Project>(`/clients/${client.id}/jobs/${job.id}/script`),
  });
  return (
    <Modal title={job.name + ' / V' + job.revision} onClose={onClose}>
      {job.hasOutput ? (
        <>
          <video
            className="review-video"
            controls
            src={jobUrl(client.id, job.id)}
            onTimeUpdate={(e) => setTime(Math.floor(e.currentTarget.currentTime))}
          />
          <div className="row wrap">
            <a className="button" href={jobUrl(client.id, job.id, 'mp4', true)}>
              <Download size={15} />
              MP4 粗剪
            </a>
            <a className="button" href={jobUrl(client.id, job.id, 'srt', true)}>
              <Download size={15} />
              SRT 字幕
            </a>
          </div>
        </>
      ) : (
        <div className="hint">{job.message}</div>
      )}
      <details>
        <summary>查看提交时的脚本快照</summary>
        {script.data?.shots.map((s, i) => (
          <div className="snapshot-shot" key={i}>
            <b>
              {i + 1} / {s.duration}s
            </b>
            <p>{s.visual}</p>
            <small>{s.narration}</small>
          </div>
        ))}
      </details>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          action.run(async () => {
            await post(`/clients/${client.id}/jobs/${job.id}/reviews`, {
              timecode: time,
              decision,
              comment,
            });
            setComment('');
            await cache.invalidateQueries({ queryKey: [client.id, 'reviews', job.id] });
            await cache.invalidateQueries({ queryKey: [client.id, 'jobs'] });
          }, '审核意见已保存');
        }}
      >
        <div className="form-grid">
          <Field label="时间码 / 秒">
            <input
              type="number"
              min={0}
              max={3600}
              value={time}
              onChange={(e) => setTime(Number(e.target.value))}
            />
          </Field>
          <Field label="审核决定">
            <select value={decision} onChange={(e) => setDecision(e.target.value)}>
              <option value="COMMENT">记录意见</option>
              {job.hasOutput && (
                <>
                  <option value="CHANGES_REQUESTED">退回修改</option>
                  {job.status !== 'DELIVERED' && <option value="DELIVERED">确认交付</option>}
                </>
              )}
            </select>
          </Field>
        </div>
        <Field label="意见说明">
          <textarea
            required
            maxLength={2000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="说明本版可交付，或记录具体镜头和需要调整的内容。"
          />
        </Field>
        {action.error && <ErrorState error={new Error(action.error)} />}
        <button className="primary" disabled={action.busy}>
          保存审核意见
        </button>
        <p className="caption">修改画面请回到项目编辑脚本，再提交新版本；既有版本始终保留。</p>
        <Link to={'/studio/' + job.projectId} onClick={onClose}>
          打开项目脚本 ↗
        </Link>
      </form>
      <h3>审核记录</h3>
      {reviews.error && <ErrorState error={reviews.error} />}
      <div className="review-history">
        {reviews.data?.map((r, i) => (
          <div key={i}>
            <strong>
              {r.author}{' '}
              <span className="pill">
                {r.decision === 'COMMENT' ? '意见' : statusLabel[r.decision]}
              </span>
            </strong>
            <p>
              {r.timecode}s · {r.comment}
            </p>
          </div>
        ))}
      </div>
    </Modal>
  );
}
