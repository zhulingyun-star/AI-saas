import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, FolderInput, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { fileUrl, post, put, request } from '../../api';
import { useWorkspace } from '../../components/UI';
import { Btn, Card, CardHead, Chip, Dialog, Field, Notice, Tabs } from '../../gy/ui';
import { folderPath, InlineName, orderedFolders } from '../../gy/folders';
import type { StoryboardState } from '../../storyboard';
import {
  boardLabel,
  HOOK_TYPES,
  isRunning,
  sec,
  SHOT_TASKS,
  thumbUrl,
  useReferenceLibrary,
  useRefreshReferences,
  type RefDetail,
} from './data';

const TABS = ['镜头拆解', '台词', '结构总结'] as const;
type Tab = (typeof TABS)[number];
const SOURCE: Record<string, string> = { subtitle: '字幕', audio: '语音', manual: '手动' };
const hookTip = (h?: string | null) => HOOK_TYPES.find(([n]) => n === h)?.[1] ?? '';

export default function ReferenceDetail() {
  const { id = '' } = useParams();
  const { client, notify } = useWorkspace();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const refresh = useRefreshReferences();
  const { folders } = useReferenceLibrary();
  const video = useRef<HTMLVideoElement>(null);
  const [tab, setTab] = useState<Tab>('镜头拆解');
  const [renaming, setRenaming] = useState(false);
  const [labels, setLabels] = useState<{
    hook: string | null;
    tasks: Record<string, string>;
  } | null>(null);
  const [dialog, setDialog] = useState<'move' | 'redo' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [dialogErr, setDialogErr] = useState('');
  const [moveTo, setMoveTo] = useState('');
  const [size, setSize] = useState<[number, number] | null>(null);
  const [clockNow, setClockNow] = useState(Date.now());

  const boardKey = [client.id, id, 'storyboard'];
  const board = useQuery<StoryboardState>({
    queryKey: boardKey,
    queryFn: () => request(`/clients/${client.id}/assets/${id}/storyboard`),
    refetchInterval: (q) => (isRunning(q.state.data?.status) ? 2000 : false),
  });
  const detail = useQuery<RefDetail>({
    queryKey: [client.id, 'reference', id],
    queryFn: () => request(`/clients/${client.id}/references/${id}`),
  });
  const running = isRunning(board.data?.status);
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) void refresh();
    wasRunning.current = running;
  }, [running, refresh]);
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [running]);

  const d = detail.data;
  const report = board.data?.report;
  if (detail.isPending)
    return (
      <div className="gy-page gy-new">
        <span className="gy-muted">正在加载参考视频…</span>
      </div>
    );
  if (!d)
    return (
      <div className="gy-page gy-new">
        <button type="button" className="gy-backlink" onClick={() => navigate('/references')}>
          <ChevronLeft size={14} aria-hidden="true" />
          返回参考视频库
        </button>
        <Notice tone="error" title="没找到这条参考视频">
          {(detail.error as Error | null)?.message ?? '它可能已经被删除了。'}
        </Notice>
      </div>
    );

  const enabled = d.analysisEnabled;
  const [stateLabel, tone] = boardLabel({
    ...d.storyboard,
    status: board.data?.status ?? d.storyboard.status,
    hasReport: !!report || d.storyboard.hasReport,
  });
  const tasks = labels ? labels.tasks : d.shotTasks;
  const hook = labels ? labels.hook : (d.hook ?? null);
  const waited = Math.max(
    0,
    Math.floor(
      (board.data?.progress?.elapsedSeconds ?? 0) + (clockNow - board.dataUpdatedAt) / 1000,
    ),
  );
  const seek = (at: number) => {
    if (!video.current) return;
    video.current.currentTime = at;
    void video.current.play().catch(() => undefined);
  };
  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      if (done) notify(done);
      return true;
    } catch (e) {
      setErr((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const saveName = (v: string | null) => {
    setRenaming(false);
    const name = v?.trim();
    if (!name || name === d.name) return;
    void run(async () => {
      const next = await put<RefDetail>(`/clients/${client.id}/references/${id}/name`, {
        name,
        revision: d.labelRevision,
      });
      cache.setQueryData([client.id, 'reference', id], next);
      await refresh();
    }, `已改名为「${name}」`);
  };
  const saveLabels = () =>
    void run(async () => {
      const next = await put<RefDetail>(`/clients/${client.id}/references/${id}/labels`, {
        hook: labels!.hook,
        shotTasks: labels!.tasks,
        revision: d.labelRevision,
      });
      cache.setQueryData([client.id, 'reference', id], next);
      setLabels(null);
      await refresh();
    }, '开头类型和每镜任务已保存');
  const dialogRun = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setDialogErr('');
    try {
      await fn();
      setDialog(null);
    } catch (e) {
      setDialogErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const startAnalysis = () =>
    dialogRun(async () => {
      const next = await post<StoryboardState>(`/clients/${client.id}/assets/${id}/storyboard`, {
        revision: board.data?.revision ?? 0,
        confirmed: true,
      });
      cache.setQueryData(boardKey, next);
      await refresh();
      notify('已开始拆解');
    });

  const flow = (report?.shots ?? [])
    .map((s, i) => [i + 1, tasks[s.id]] as const)
    .filter(([, t]) => !!t);
  const metaParts = [
    folderPath(folders, d.folderId),
    report ? `${sec(report.duration)} 秒` : '',
    report ? `${report.shots.length} 个镜头` : '',
    report ? `${report.dialogue.length} 句台词` : '',
    report && board.data ? `拆解修订 ${board.data.revision}` : '',
  ].filter(Boolean);

  const pending = (
    <Card className="gy-rpend">
      {running ? (
        <>
          <Sparkles size={22} aria-hidden="true" />
          <b>正在拆解镜头和台词</b>
          <span role="status">
            {board.data?.progress?.phase ?? '等待开始'} · 已等待 {waited} 秒
          </span>
          <span className="gy-fine">拆完这里会自动显示每个镜头、台词和结构总结，不用刷新。</span>
        </>
      ) : board.data?.status === 'FAILED' ? (
        <>
          <b>拆解没成功</b>
          <span>{board.data.error || '视频处理或读片出了问题。'}</span>
          {enabled && (
            <Btn variant="primary" onClick={() => setDialog('redo')}>
              再拆一次
            </Btn>
          )}
        </>
      ) : (
        <>
          <b>还没拆解</b>
          <span>
            {enabled
              ? '拆解后会列出每个镜头的时间、机位、画面和台词。'
              : '读片模型还没配置，暂时拆不了。视频已经存在库里，可以先播放、改名、放进文件夹。'}
          </span>
          {enabled && (
            <Btn variant="primary" onClick={() => setDialog('redo')}>
              <Sparkles size={14} aria-hidden="true" />
              开始拆解
            </Btn>
          )}
        </>
      )}
    </Card>
  );

  const shotsTab = report ? (
    <Card className="gy-rshots">
      {report.shots.map((s, i) => (
        <div className="gy-rshot" key={s.id}>
          <button
            type="button"
            className="fr"
            aria-label={`播放镜头 ${i + 1}`}
            onClick={() => seek(s.start)}
          >
            <img
              src={thumbUrl(client.id, id, (s.start + s.end) / 2)}
              alt={`镜头 ${i + 1} 缩略图`}
              loading="lazy"
            />
          </button>
          <span className="tm">
            <b>镜头 {i + 1}</b>
            {sec(s.start)}–{sec(s.end)} 秒<span>{s.transition || '—'}</span>
          </span>
          <span className="ac">
            <span>{s.action || <span className="gy-muted">画面没写</span>}</span>
            {s.camera && <small>{s.camera}</small>}
            {s.text && <span className="sub">画面字幕：{s.text}</span>}
            {labels ? (
              <label className="gy-rtask">
                任务
                <select
                  className="gy-select"
                  aria-label={`镜头 ${i + 1} 的任务`}
                  value={labels.tasks[s.id] ?? ''}
                  onChange={(e) =>
                    setLabels({ ...labels, tasks: { ...labels.tasks, [s.id]: e.target.value } })
                  }
                >
                  <option value="">还没标</option>
                  {SHOT_TASKS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="gy-rtask">
                任务{tasks[s.id] ? <b>{tasks[s.id]}</b> : <em>还没标</em>}
              </span>
            )}
          </span>
        </div>
      ))}
    </Card>
  ) : (
    pending
  );

  const sources = report
    ? Object.entries(
        report.dialogue.reduce<Record<string, number>>(
          (m, l) => ({ ...m, [l.source]: (m[l.source] ?? 0) + 1 }),
          {},
        ),
      )
        .map(([k, n]) => `${SOURCE[k] ?? k} ${n} 句`)
        .join(' · ')
    : '';
  const linesTab = report ? (
    <Card className="gy-rlines">
      <p className="gy-muted" style={{ padding: '10px 0 4px' }}>
        {report.dialogue.length
          ? `${report.dialogue.length} 句 · ${sources}`
          : '这条视频没拆出台词'}
      </p>
      <div>
        {report.dialogue.map((l, i) => (
          <div className="gy-rline" key={l.id}>
            <button type="button" aria-label={`播放第 ${i + 1} 句`} onClick={() => seek(l.start)}>
              {l.start.toFixed(2)} 秒
            </button>
            <span>{l.text}</span>
            {l.source !== 'subtitle' ? (
              <span className="gy-mini">{SOURCE[l.source] ?? l.source}</span>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>
    </Card>
  ) : (
    pending
  );
  const summaryTab = report ? (
    <Card pad>
      <div className="gy-uf">
        <span>结构和节奏</span>
        <div className="v">
          {report.summary || <span className="gy-muted">拆解结果里没有写</span>}
        </div>
      </div>
      <div className="gy-uf">
        <span>音乐和声音</span>
        <div className="v">
          {report.music || <span className="gy-muted">拆解结果里没有写</span>}
        </div>
      </div>
      <div className="gy-uf">
        <span>按每镜任务看</span>
        {flow.length ? (
          <div className="gy-tflow">
            {flow.map(([n, t], i) => (
              <span key={n} className="gy-row" style={{ gap: 6 }}>
                {i > 0 && '→'}
                <span className="gy-mini">
                  镜头 {n} · {t}
                </span>
              </span>
            ))}
          </div>
        ) : (
          <span className="gy-muted">
            每镜任务还没标，在“镜头拆解”里标好以后，这里会按顺序列出来。
          </span>
        )}
      </div>
    </Card>
  ) : (
    pending
  );

  return (
    <div className="gy-page gy-new">
      <button type="button" className="gy-backlink" onClick={() => navigate('/references')}>
        <ChevronLeft size={14} aria-hidden="true" />
        返回参考视频库
      </button>
      <div className="gy-rhead">
        <div style={{ minWidth: 0 }}>
          {renaming ? (
            <InlineName
              label="参考视频名称"
              initial={d.name}
              maxLength={60}
              className="gy-rename"
              onDone={saveName}
            />
          ) : (
            <h1>
              {d.name}
              <button
                type="button"
                className="gy-icon-btn"
                aria-label="重命名参考视频"
                title="重命名"
                onClick={() => setRenaming(true)}
              >
                <Pencil size={14} />
              </button>
            </h1>
          )}
          <p>{metaParts.join(' · ')}</p>
        </div>
        <div className="gy-row">
          <Btn
            onClick={() => {
              setMoveTo(d.folderId ?? '');
              setDialogErr('');
              setDialog('move');
            }}
          >
            <FolderInput size={14} aria-hidden="true" />
            移动到文件夹
          </Btn>
          <Btn
            disabled={!enabled || running || !!labels}
            title={enabled ? undefined : '读片模型还没配置'}
            busy={running}
            onClick={() => {
              setDialogErr('');
              setDialog('redo');
            }}
          >
            {!running && <Sparkles size={14} aria-hidden="true" />}
            {running ? '拆解中…' : report ? '重新拆解' : '开始拆解'}
          </Btn>
          <Btn
            variant="ghost"
            danger
            onClick={() => {
              setDialogErr('');
              setDialog('delete');
            }}
          >
            <Trash2 size={14} aria-hidden="true" />
            删除
          </Btn>
          <Btn
            variant="primary"
            onClick={() => {
              notify(`新建项目后选“视频二创”，再选「${d.name}」这条参考视频`);
              navigate('/');
            }}
          >
            用它新建项目
          </Btn>
        </div>
      </div>
      {err && <Notice tone="error">{err}</Notice>}
      {running && report && (
        <Notice tone="info" title="正在重新拆解">
          {board.data?.progress?.phase ?? '等待开始'} · 已等待 {waited}{' '}
          秒。下面先显示上一次的结果，拆完会自动更新。
        </Notice>
      )}
      {!running && board.data?.status === 'FAILED' && report && (
        <Notice tone="warn" title="最近一次重新拆解没成功，下面是之前的结果">
          {board.data.error}
        </Notice>
      )}
      <div className="gy-rdet">
        <div className="gy-rleft">
          <Card className="gy-rplayer">
            <video
              ref={video}
              src={fileUrl(client.id, id)}
              controls
              playsInline
              preload="metadata"
              aria-label="参考视频原片"
              onLoadedMetadata={(e) =>
                setSize([e.currentTarget.videoWidth, e.currentTarget.videoHeight])
              }
            />
            <dl>
              <dt>文件</dt>
              <dd>{d.fileName}</dd>
              <dt>时长</dt>
              <dd>
                {report ? `${sec(report.duration)} 秒` : '拆解后显示'}
                {size &&
                  size[0] > 0 &&
                  ` · ${size[1] > size[0] ? '竖屏' : '横屏'} ${size[0]}×${size[1]}`}
              </dd>
              <dt>大小</dt>
              <dd>{(d.sizeBytes / 1024 / 1024).toFixed(1)} MB</dd>
              <dt>状态</dt>
              <dd className={`gy-dot ${tone}`}>{stateLabel}</dd>
            </dl>
          </Card>
          <Card pad>
            <CardHead title="用在这些项目">
              <small>{d.usedBy.length} 个</small>
            </CardHead>
            {d.usedBy.length ? (
              <div className="gy-ruses">
                {d.usedBy.map((u) => (
                  <Link
                    key={`${u.kind}:${u.id}`}
                    className="it"
                    to={u.kind === 'campaign' ? `/projects/${u.id}` : `/studio/${u.id}`}
                  >
                    {u.name}
                    <small>{u.kind === 'campaign' ? '项目' : '作品'}</small>
                  </Link>
                ))}
              </div>
            ) : (
              <span className="gy-muted">还没有项目用过这条参考视频。</span>
            )}
          </Card>
        </div>
        <div className="gy-rright">
          <Card pad editing={!!labels}>
            <CardHead title="这条视频的开头">
              {labels ? (
                <>
                  <Btn variant="ghost" size="xs" disabled={busy} onClick={() => setLabels(null)}>
                    取消
                  </Btn>
                  <Btn variant="primary" size="xs" busy={busy} onClick={saveLabels}>
                    保存
                  </Btn>
                </>
              ) : (
                <Btn
                  size="xs"
                  disabled={running}
                  onClick={() => {
                    setLabels({ hook: d.hook ?? null, tasks: { ...d.shotTasks } });
                    setTab('镜头拆解');
                  }}
                >
                  <Pencil size={12} aria-hidden="true" />
                  标开头和每镜任务
                </Btn>
              )}
            </CardHead>
            {labels ? (
              <>
                <div className="gy-hooks" role="group" aria-label="开头类型">
                  {HOOK_TYPES.map(([h]) => (
                    <Chip
                      key={h}
                      pressed={labels.hook === h}
                      onClick={() => setLabels({ ...labels, hook: labels.hook === h ? null : h })}
                    >
                      {h}
                    </Chip>
                  ))}
                </div>
                <span className="gy-fine">
                  {labels.hook
                    ? `${labels.hook}：${hookTip(labels.hook)}。再点一次可以取消。`
                    : '看一下第 1 镜怎么开口，从 8 种里选一个；拿不准可以先不标。'}
                  {report ? ' 每镜任务在下面每个镜头里选。' : ' 拆解完才能标每镜任务。'}
                </span>
              </>
            ) : (
              <div className="gy-hookv">
                {hook ? (
                  <>
                    <b>{hook}</b>
                    <span className="tip">{hookTip(hook)}</span>
                  </>
                ) : (
                  <>
                    <em>还没标</em>
                    <span className="tip">拆解结果里没有开头类型，需要人工看完开头再选。</span>
                  </>
                )}
              </div>
            )}
            {!labels && report && (
              <span className="gy-fine">
                每镜任务：已标 {Object.keys(tasks).length} / {report.shots.length} 个镜头
              </span>
            )}
          </Card>
          <Tabs tabs={TABS} value={tab} onChange={setTab} label="参考视频拆解" />
          {tab === '镜头拆解' ? shotsTab : tab === '台词' ? linesTab : summaryTab}
        </div>
      </div>

      {dialog === 'move' && (
        <Dialog
          title="移动到文件夹"
          onClose={() => !busy && setDialog(null)}
          footer={
            <>
              <Btn variant="ghost" disabled={busy} onClick={() => setDialog(null)}>
                取消
              </Btn>
              <Btn
                variant="primary"
                busy={busy}
                onClick={() =>
                  void dialogRun(async () => {
                    const next = await put<RefDetail>(
                      `/clients/${client.id}/references/${id}/folder`,
                      {
                        folderId: moveTo || null,
                      },
                    );
                    cache.setQueryData([client.id, 'reference', id], next);
                    await refresh();
                    notify(`已移到「${folderPath(folders, moveTo || null)}」`);
                  })
                }
              >
                移动
              </Btn>
            </>
          }
        >
          <Field label="放进文件夹" htmlFor="ref-move">
            <select
              id="ref-move"
              className="gy-select"
              value={moveTo}
              onChange={(e) => setMoveTo(e.target.value)}
            >
              <option value="">未分类</option>
              {orderedFolders(folders).map((f) => (
                <option key={f.id} value={f.id}>
                  {folderPath(folders, f.id)}
                </option>
              ))}
            </select>
          </Field>
          <span className="gy-fine">一条参考视频只放在一个文件夹里。</span>
          {dialogErr && <Notice tone="error">{dialogErr}</Notice>}
        </Dialog>
      )}
      {dialog === 'redo' && (
        <Dialog
          title={report ? '重新拆解' : '开始拆解'}
          onClose={() => !busy && setDialog(null)}
          footer={
            <>
              <Btn variant="ghost" disabled={busy} onClick={() => setDialog(null)}>
                取消
              </Btn>
              <Btn variant="primary" busy={busy} onClick={() => void startAnalysis()}>
                {report ? '重新拆解' : '开始拆解'}
              </Btn>
            </>
          }
        >
          <p>
            {report
              ? '会用新结果替换现在的镜头、台词和结构总结（之前手动改过的分镜也会被替换）。开头类型会保留；镜头变了的话，每镜任务要重新标。'
              : '拆出每个镜头的时间、机位、画面和台词，拆完自动显示。'}
          </p>
          {dialogErr && <Notice tone="error">{dialogErr}</Notice>}
        </Dialog>
      )}
      {dialog === 'delete' && (
        <Dialog
          title="删除参考视频"
          onClose={() => !busy && setDialog(null)}
          footer={
            <>
              <Btn variant="ghost" disabled={busy} onClick={() => setDialog(null)}>
                取消
              </Btn>
              <Btn
                variant="primary"
                busy={busy}
                onClick={() =>
                  void dialogRun(async () => {
                    await request(`/clients/${client.id}/assets/${id}/reference`, {
                      method: 'DELETE',
                    });
                    cache.removeQueries({ queryKey: boardKey });
                    cache.removeQueries({ queryKey: [client.id, 'reference', id] });
                    await refresh();
                    notify('参考视频已删除');
                    navigate('/references');
                  })
                }
              >
                {busy ? '正在删除…' : '确认删除'}
              </Btn>
            </>
          }
        >
          <p>
            确认删除「{d.name}」？对应的拆解结果、开头类型和每镜任务也会删除，删除后可以重新上传。
          </p>
          {dialogErr && <Notice tone="error">{dialogErr}</Notice>}
        </Dialog>
      )}
    </div>
  );
}
