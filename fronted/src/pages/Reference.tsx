import ResourceNav from '../components/ResourceNav';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Plus, Trash2, Save } from 'lucide-react';
import {
  Header,
  Empty,
  Field,
  useData,
  useWorkspace,
  useAction,
  ErrorState,
} from '../components/UI';
import { put, fileUrl } from '../api';
import type { Asset, Project } from '../types';
interface Mark {
  time: number;
  visual: string;
  audio: string;
  adaptation: string;
}
export default function Reference() {
  const { client } = useWorkspace();
  const cache = useQueryClient();
  const data = useData<Asset[]>('assets');
  const projects = useData<Project[]>('projects');
  const action = useAction();
  const [id, setId] = useState('');
  const [marks, setMarks] = useState<Mark[]>([]);
  const [projectId, setProjectId] = useState('');
  const [mode, setMode] = useState('single');
  const [markIndex, setMarkIndex] = useState(0);
  const [targetIndex, setTargetIndex] = useState(0);
  const [frame, setFrame] = useState('');
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const assets = data.data?.filter((a) => a.mime.startsWith('video/')) ?? [];
  const selected = assets.find((a) => a.id === id);
  function capture() {
    if (!video.current) return;
    const c = document.createElement('canvas');
    c.width = 360;
    c.height = Math.round((360 * video.current.videoHeight) / video.current.videoWidth) || 640;
    c.getContext('2d')?.drawImage(video.current, 0, 0, c.width, c.height);
    setFrame(c.toDataURL('image/jpeg'));
    setPosition(video.current.currentTime);
  }
  return (
    <>
      <ResourceNav />
      <Header
        title="参考片拆解"
        description="看真实画面，标真实切点，再把可借鉴的结构改编为自己的商品脚本。"
      >
        <Link to="/assets" className="button">
          上传参考视频
        </Link>
      </Header>
      <div className="hint">
        当前支持真实播放、浏览器抽帧和人工拆解。自动切镜、语音识别与 OCR
        尚未接入，系统不会用通用模板冒充对视频的识别。
      </div>
      {action.error && <ErrorState error={new Error(action.error)} />}
      <div className="reference-grid">
        <section className="panel padded">
          <Field label="选择客户视频">
            <select
              value={id}
              onChange={(e) => {
                const asset = assets.find((a) => a.id === e.target.value);
                setId(e.target.value);
                setMarks((asset?.metadata.marks as Mark[]) ?? []);
                setFrame('');
                setPosition(0);
              }}
            >
              <option value="">请选择真实视频</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          {selected ? (
            <>
              <video
                ref={video}
                className="reference-video"
                src={fileUrl(client.id, id)}
                controls
                onLoadedMetadata={(e) =>
                  setDuration(
                    Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0,
                  )
                }
                onDurationChange={(e) =>
                  setDuration(
                    Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0,
                  )
                }
                onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
              />
              <div className="row between">
                <small>
                  {position.toFixed(1)} /{' '}
                  {duration > 0 ? duration.toFixed(1) + ' 秒' : '时长待解析'}
                </small>
                <button onClick={capture}>
                  <Camera size={16} />
                  抽取当前帧
                </button>
              </div>
              {frame && (
                <img className="captured-frame" src={frame} alt="从真实参考视频抽取的当前帧" />
              )}
            </>
          ) : (
            <Empty title="选择一条参考片" description="视频和改编单并排，方便逐镜核对。" />
          )}
        </section>
        <section className="panel padded">
          <div className="row between">
            <h2>人工切点与改编单</h2>
            <button
              disabled={!selected || marks.length >= 20}
              onClick={() =>
                setMarks(
                  [
                    ...marks,
                    { time: Number(position.toFixed(1)), visual: '', audio: '', adaptation: '' },
                  ].sort((a, b) => a.time - b.time),
                )
              }
            >
              <Plus size={16} />
              标记当前切点
            </button>
          </div>
          {marks.map((mark, i) => (
            <article className="reference-mark" key={i}>
              <div className="row between">
                <button
                  onClick={() => {
                    if (video.current) video.current.currentTime = mark.time;
                  }}
                >
                  {mark.time.toFixed(1)}s / 镜头 {i + 1}
                </button>
                <button
                  className="icon-button"
                  aria-label="删除切点"
                  onClick={() => setMarks(marks.filter((_, index) => index !== i))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {(['visual', 'audio', 'adaptation'] as const).map((key, j) => (
                <Field
                  key={key}
                  label={['画面 / 商品职责', '台词 / 花字 / 声音', '当前商品如何改编'][j]}
                >
                  <textarea
                    rows={2}
                    maxLength={600}
                    value={mark[key]}
                    onChange={(e) =>
                      setMarks(marks.map((m, n) => (n === i ? { ...m, [key]: e.target.value } : m)))
                    }
                  />
                </Field>
              ))}
            </article>
          ))}
          <div className="row wrap">
            <button
              disabled={!selected || action.busy}
              onClick={() =>
                action.run(async () => {
                  await put(`/clients/${client.id}/assets/${id}`, {
                    ...selected!,
                    metadata: { ...selected!.metadata, marks, duration },
                  });
                  await cache.invalidateQueries({ queryKey: [client.id, 'assets'] });
                }, '参考拆解已保存到真实素材')
              }
            >
              <Save size={16} />
              保存拆解
            </button>
          </div>
          <div className="divider" />
          <Field label="带入已有作品">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">选择改编作品</option>
              {projects.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="改编方式">
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="single">只替换一镜</option>
              <option value="structure">替换完整镜头结构</option>
            </select>
          </Field>
          {mode === 'single' && (
            <div className="form-grid">
              <Field label="参考镜头">
                <select value={markIndex} onChange={(e) => setMarkIndex(Number(e.target.value))}>
                  {marks.map((m, i) => (
                    <option key={i} value={i}>
                      第 {i + 1} 镜 / {m.time}s
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="目标作品镜头">
                <select
                  value={targetIndex}
                  onChange={(e) => setTargetIndex(Number(e.target.value))}
                >
                  {projects.data
                    ?.find((p) => p.id === projectId)
                    ?.shots.map((s, i) => (
                      <option key={i} value={i}>
                        第 {i + 1} 镜 / {s.duration}s {s.locked ? '（已锁定）' : ''}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
          )}
          <button
            disabled={!marks.length || !projectId || action.busy}
            onClick={() =>
              action.run(
                async () => {
                  const p = projects.data!.find((p) => p.id === projectId)!;
                  let shots = p.shots;
                  if (mode === 'single') {
                    const mark = marks[markIndex],
                      target = shots[targetIndex];
                    if (!mark || !target) throw new Error('请选择有效的参考镜头与目标镜头');
                    if (target.locked) throw new Error('目标镜头已锁定，请先在作品中解锁');
                    if (!mark.adaptation.trim()) throw new Error('请先填写当前商品如何改编');
                    shots = shots.map((s, i) =>
                      i === targetIndex ? { ...s, visual: mark.adaptation } : s,
                    );
                  } else {
                    if (shots.some((s) => s.locked))
                      throw new Error('作品包含已锁定镜头，请使用单镜改编或先解锁');
                    if (marks.length > p.duration) throw new Error('切点数超过作品秒数');
                    shots = marks.map((m, i) => ({
                      duration:
                        Math.floor(p.duration / marks.length) +
                        (i < p.duration % marks.length ? 1 : 0),
                      visual: m.adaptation || '请填写改编画面',
                      narration: '',
                      assetId: null,
                      startAt: 0,
                      locked: false,
                    }));
                  }
                  const links = Array.isArray(p.config.referenceLinks)
                    ? p.config.referenceLinks
                    : [];
                  await put(`/clients/${client.id}/projects/${p.id}`, {
                    ...p,
                    shots,
                    config: {
                      ...p.config,
                      referenceLinks: [
                        ...links,
                        {
                          assetId: id,
                          mode,
                          source: mode === 'single' ? marks[markIndex] : marks,
                          targetIndex: mode === 'single' ? targetIndex : null,
                        },
                      ],
                    },
                  });
                  await cache.invalidateQueries({ queryKey: [client.id, 'projects'] });
                },
                mode === 'single' ? '本镜改编已保存，其他镜头与台词保持原样' : '改编结构已写入作品',
              )
            }
          >
            {mode === 'single' ? '替换目标这一镜' : '将改编结构写入作品'}
          </button>
          <p className="caption">
            单镜改编保留目标镜头时长、台词与实际商品素材，来源时间码随作品保存；完整结构替换会重建镜头单。原片品牌与台词不自动复制。
          </p>
        </section>
      </div>
    </>
  );
}
