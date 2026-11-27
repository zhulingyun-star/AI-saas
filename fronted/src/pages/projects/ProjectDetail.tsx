import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Pencil } from 'lucide-react';
import { fileUrl, put, request } from '../../api';
import { useWorkspace } from '../../components/UI';
import { Btn, Card, Chip, Dialog, Notice } from '../../gy/ui';
import { folderPath, InlineName, orderedFolders } from '../../gy/folders';
import { ReferencePicker } from '../references';
import { coverAt, HOOK_TYPES, thumbUrl } from '../references/data';
import ProductPicker from './ProductPicker';
import { ProductButton, RatioPicker, ReferenceRow, TopBar, type Step } from './parts';
import StepStoryboard from './StepStoryboard';
import StepOutput, { type Lane } from './StepOutput';
import ModeDetail from './ModeDetail';
import {
  formatRR,
  isModeFlow,
  MODE_LABEL,
  shortTime,
  useProjectLibrary,
  useRefreshProjects,
  versionRunning,
  type Flow,
  type ModeFlow,
} from './data';

function defaultStep(f: Flow): Step {
  if (f.versions.length || f.storyboard.confirmed) return 4;
  if (f.storyboard.saved) return 3;
  return 2;
}

/** 项目详情：商品 → 方向 → 分镜 → 出片。这里是复刻；框架模式 / 简易交给 ModeDetail。 */
export default function ProjectDetail() {
  const { id = '' } = useParams();
  const { client, notify } = useWorkspace();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [params, setParams] = useSearchParams();
  const refresh = useRefreshProjects();
  const { folders } = useProjectLibrary();
  const key = [client.id, 'project-flow', id];
  const q = useQuery({
    queryKey: key,
    queryFn: () => request<Flow | ModeFlow>(`/clients/${client.id}/projects/${id}/flow`),
    refetchInterval: (query) => (query.state.data?.versions?.some(versionRunning) ? 3000 : false),
  });
  const raw = q.data;
  const f = raw && !isModeFlow(raw) ? raw : undefined;
  const stepParam = Number(params.get('step'));
  const step: Step | null = [1, 2, 3, 4].includes(stepParam)
    ? (stepParam as Step)
    : f
      ? defaultStep(f)
      : null;
  const go = (s: Step) => {
    const next = new URLSearchParams(params);
    next.set('step', String(s));
    setParams(next, { replace: false });
    window.scrollTo?.({ top: 0 });
  };
  const apply = (next: Flow | ModeFlow) => {
    cache.setQueryData(key, next);
    void cache.invalidateQueries({ queryKey: [client.id, 'project-library'] });
  };
  const [renaming, setRenaming] = useState(false);
  const [picker, setPicker] = useState<'product' | 'reference' | null>(null);
  const [pending, setPending] = useState<
    | { kind: 'product'; anchorId: string; name: string }
    | { kind: 'reference'; assetId: string; name: string }
    | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [approach, setApproach] = useState<string | null>(null);
  useEffect(() => setApproach(null), [id]);

  if (raw && isModeFlow(raw))
    return <ModeDetail flow={raw} apply={apply} reload={q.refetch} folders={folders} />;

  if (q.isPending)
    return (
      <div className="gy-page gy-new">
        <span className="gy-muted">正在加载项目…</span>
      </div>
    );
  if (!f || !step)
    return (
      <div className="gy-page gy-new">
        <button type="button" className="gy-backlink" onClick={() => navigate('/')}>
          <ChevronLeft size={14} aria-hidden="true" />
          返回项目列表
        </button>
        {(() => {
          const message = (q.error as Error | null)?.message ?? '它可能已经被删除了。';
          const legacy = message.match(/旧页面里打开：(\/\S+)/)?.[1];
          return legacy ? (
            <Notice
              tone="info"
              title="这个项目还在旧的制作页里"
              actions={
                <Btn size="xs" variant="primary" onClick={() => navigate(legacy)}>
                  去旧页面打开
                </Btn>
              }
            >
            </Notice>
          ) : (
            <Notice tone="error" title="项目没打开">
              {message}
            </Notice>
          );
        })()}
      </div>
    );

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
  const settings = (body: Record<string, unknown>, done?: string) =>
    run(async () => {
      apply(
        await put<Flow>(`/clients/${client.id}/projects/${id}/settings`, {
          revision: f.revision,
          ...body,
        }),
      );
    }, done);
  const p = f.project;
  const ref = f.reference;
  const report = ref.report;
  const shots = f.storyboard.shots;
  const lineCount = shots.reduce((n, s) => n + s.lines.length, 0);
  const running = f.versions.find(versionRunning);
  const hook = HOOK_TYPES.find(([h]) => h === ref.hook);
  const personas = f.product.personas ?? [];
  const steps: [string, string, 'done' | 'now' | 'wait'][] = [
    ['商品', `${f.product.name} · 事实已核对`, 'done'],
    ['方向', `参考视频 · ${ref.name}`, f.storyboard.saved || f.versions.length ? 'done' : 'now'],
    [
      '分镜',
      f.storyboard.confirmed
        ? `${shots.length} 个镜头 · ${lineCount} 句台词 · 已确认`
        : f.storyboard.saved
          ? `${shots.length} 个镜头 · 编辑中，还没确认`
          : `${shots.length} 个镜头 · 等你改成自己的`,
      f.storyboard.confirmed ? 'done' : f.storyboard.saved ? 'now' : 'wait',
    ],
    [
      '出片',
      running
        ? `第 ${running.no} 版出片中`
        : f.versions.length
          ? `${f.versions.length} 个版本`
          : f.storyboard.confirmed
            ? '可以出第一版'
            : '待确认分镜',
      running || (f.storyboard.confirmed && !f.versions.length)
        ? 'now'
        : f.versions.length
          ? 'done'
          : 'wait',
    ],
  ];
  const approachText = f.settings.approach || f.legacyApproach?.approach || '';

  const sideRail = (
    <aside className="gy-card gy-pdrail" aria-label="项目信息">
      <h3>项目信息</h3>
      <Link className="lk" to={`/products/${f.product.anchorId}`}>
        <span className="im">
          {f.product.coverId && <img src={fileUrl(client.id, f.product.coverId)} alt="" />}
        </span>
        <span>
          <b>{f.product.name}</b>
          <small>商品 · {f.product.imageIds.length} 张图</small>
        </span>
      </Link>
      <Link className="lk" to={`/references/${ref.assetId}`}>
        <span className="im ref">
          {coverAt(ref.storyboard) !== null && (
            <img src={thumbUrl(client.id, ref.assetId, coverAt(ref.storyboard)!)} alt="" />
          )}
        </span>
        <span>
          <b>{ref.name}</b>
          <small>参考视频{report ? ` · ${report.duration.toFixed(1)} 秒` : ''}</small>
        </span>
      </Link>
      <div className="gy-rrrail">
        <b>画幅和分辨率</b>
        <RatioPicker
          ratio={f.settings.ratio}
          resolution={f.settings.resolution}
          disabled={busy}
          onChange={(next) => void settings(next, `已改成 ${formatRR(next)}，只影响之后出的版本`)}
        />
      </div>
      <label className="gy-rrrail">
        <b>文件夹</b>
        <select
          className="gy-select"
          aria-label="项目所在文件夹"
          value={p.folderId ?? ''}
          onChange={(e) =>
            void run(
              async () => {
                await put(`/clients/${client.id}/projects/${id}/folder`, {
                  folderId: e.target.value || null,
                });
                await Promise.all([refresh(), q.refetch()]);
              },
              `已移到「${folderPath(folders, e.target.value || null)}」`,
            )
          }
        >
          <option value="">未分类</option>
          {orderedFolders(folders).map((x) => (
            <option key={x.id} value={x.id}>
              {folderPath(folders, x.id)}
            </option>
          ))}
        </select>
      </label>
      <dl>
        <dt>创作方式</dt>
        <dd>{MODE_LABEL[p.mode]}</dd>
        <dt>时长</dt>
        <dd>{f.targetDuration} 秒（跟参考视频走）</dd>
        <dt>创建</dt>
        <dd>{shortTime(p.createdAt)}</dd>
      </dl>
    </aside>
  );

  const stepOne = (
    <>
      <TopBar
        actions={
          <Btn variant="primary" onClick={() => go(2)}>
            下一步：方向
          </Btn>
        }
      >
        这个项目用 <b>{f.product.name}</b> 和参考视频 <b>{ref.name}</b>。
      </TopBar>
      <Card className="gy-pjs">
        <h3>
          商品<small>一个项目只用一个商品</small>
        </h3>
        <ProductButton
          name={f.product.name}
          sku={f.product.sku}
          coverId={f.product.coverId}
          lines={[
            `${f.product.imageIds.length} 张图${f.product.analysis.category ? ` · ${f.product.analysis.category}` : ''}`,
            '商品事实已核对',
          ]}
          onClick={() => setPicker('product')}
        />
        <details className="gy-facts">
          <summary>这个项目用的商品事实</summary>
          <p>{f.settings.facts}</p>
        </details>
      </Card>
      <Card className="gy-pjs">
        <h3>
          参考视频<small>只学结构和节奏，不放进成片</small>
        </h3>
        <ReferenceRow
          item={ref}
          lines={report?.summary ? [`结构：${report.summary}`] : []}
          action={
            <Btn size="xs" onClick={() => setPicker('reference')}>
              换一条
            </Btn>
          }
        />
      </Card>
    </>
  );

  const stepTwo = (
    <>
      <TopBar
        actions={
          <Btn variant="primary" onClick={() => go(3)}>
            下一步：分镜
          </Btn>
        }
      >
        方向来自参考视频 <b>{ref.name}</b>。
      </TopBar>
      <Card className="gy-pjs">
        <h3>
          参考视频
        </h3>
        <ReferenceRow
          item={ref}
          lines={[
            report?.summary ? `结构：${report.summary}` : '',
            report?.music ? `声音：${report.music}` : '',
          ].filter(Boolean)}
        />
      </Card>
      <Card className="gy-pjs" editing={approach !== null}>
        <h3>
          改编思路<small>参考视频的节奏怎么用到你的商品上</small>
          {approach === null ? (
            <Btn size="xs" variant="ghost" onClick={() => setApproach(approachText)}>
              <Pencil size={12} aria-hidden="true" />
              {approachText ? '编辑' : '写一段'}
            </Btn>
          ) : (
            <span className="gy-row">
              <Btn size="xs" variant="ghost" disabled={busy} onClick={() => setApproach(null)}>
                取消
              </Btn>
              <Btn
                size="xs"
                variant="primary"
                busy={busy}
                onClick={() =>
                  void settings({ approach }, '改编思路已保存').then(
                    (ok) => ok && setApproach(null),
                  )
                }
              >
                保存
              </Btn>
            </span>
          )}
        </h3>
        {approach !== null ? (
          <textarea
            className="gy-textarea"
            rows={4}
            maxLength={1500}
            aria-label="改编思路"
            value={approach}
            placeholder="例如：保留“出门痛点 → 亮出产品 → 对比普通款 → 质感特写 → 上身效果”的节奏，把涂抹动作换成穿搭和鞋面特写。"
            onChange={(e) => setApproach(e.target.value)}
          />
        ) : approachText ? (
          <div className="gy-approach">
            {!f.settings.approach && f.legacyApproach && (
              <b>以前写过（{f.legacyApproach.relation}）：</b>
            )}
            {approachText}
          </div>
        ) : (
          <div className="gy-approach">
            还没有改编思路。
          </div>
        )}
      </Card>
      <Card className="gy-pjs">
        <h3>
          参考视频的开头
          <Link className="gy-link" to={`/references/${ref.assetId}`}>
            去参考视频库改
          </Link>
        </h3>
        {hook ? (
          <div className="gy-hookv">
            <b>{hook[0]}</b>
            <span className="tip">
              {hook[1]}。
              {shots[0]?.origLines.length
                ? `原视频第 1 镜：「${shots[0].origLines.join(' · ')}」`
                : ''}
            </span>
          </div>
        ) : (
          <div className="gy-hookv">
            <em>还没标</em>
          </div>
        )}
      </Card>
      <Card className="gy-pjs">
        <h3>
          给谁看<small>从商品「{f.product.name}」的人群里选一个</small>
          <Link className="gy-link" to={`/products/${f.product.anchorId}`}>
            去商品库改人群
          </Link>
        </h3>
        {personas.length ? (
          <div className="gy-hooks" role="group" aria-label="给谁看">
            {personas.map((x) => (
              <Chip
                key={x.id ?? x.name}
                pressed={f.settings.personaName === x.name}
                disabled={busy}
                onClick={() =>
                  void settings(
                    f.settings.personaName === x.name
                      ? { personaName: '' }
                      : { personaName: x.name, personaId: x.id ?? '' },
                    f.settings.personaName === x.name ? '已取消选择' : `给「${x.name}」看`,
                  )
                }
              >
                {x.name}
              </Chip>
            ))}
          </div>
        ) : (
          <span className="gy-muted">这个商品还没有人群。</span>
        )}
        {(() => {
          const cur = personas.find((x) => x.name === f.settings.personaName);
          return cur ? (
            <div className="gy-approach">
              {[
                cur.pain && `在烦：${cur.pain}`,
                cur.want && `想要：${cur.want}`,
                cur.worry && `担心：${cur.worry}`,
                cur.hooks?.length ? `常用开头：${cur.hooks.join('、')}` : '',
              ]
                .filter(Boolean)
                .join('　')}
              {!cur.id && <small>（建议人群）</small>}
            </div>
          ) : null;
        })()}
      </Card>
    </>
  );

  return (
    <div className="gy-page gy-new gy-pd">
      <button type="button" className="gy-backlink" onClick={() => navigate('/')}>
        <ChevronLeft size={14} aria-hidden="true" />
        返回项目列表
      </button>
      <div className="gy-pdh">
        <div style={{ minWidth: 0 }}>
          {renaming ? (
            <InlineName
              label="项目名称"
              initial={p.name}
              maxLength={150}
              className="gy-rename"
              onDone={(v) => {
                setRenaming(false);
                const name = v?.trim();
                if (!name || name === p.name) return;
                void run(async () => {
                  await put(`/clients/${client.id}/projects/${id}/name`, {
                    name,
                    revision: f.revision,
                  });
                  await Promise.all([q.refetch(), refresh()]);
                }, `已改名为「${name}」`);
              }}
            />
          ) : (
            <h1>
              {p.name}
              <button
                type="button"
                className="gy-icon-btn"
                aria-label="重命名项目"
                title="重命名"
                onClick={() => setRenaming(true)}
              >
                <Pencil size={14} />
              </button>
            </h1>
          )}
          <p>
            {[
              f.product.name,
              MODE_LABEL[p.mode],
              formatRR(f.settings),
              `${f.targetDuration} 秒`,
              folderPath(folders, p.folderId),
            ].join(' · ')}
          </p>
          <p className="gy-fine">商品 → 方向 → 分镜 → 出片</p>
        </div>
      </div>
      <nav className="gy-uni" aria-label="制作步骤">
        {steps.map(([t, small, state], i) => (
          <button
            key={t}
            type="button"
            className={state}
            aria-label={`第 ${i + 1} 步：${t}，${small}`}
            aria-current={step === i + 1 ? 'step' : undefined}
            onClick={() => go((i + 1) as Step)}
          >
            <span className="no">{state === 'done' ? '✓' : i + 1}</span>
            <b>{t}</b>
            <small>{small}</small>
          </button>
        ))}
      </nav>
      {err && <Notice tone="error">{err}</Notice>}
      {!f.product.analysis.hasReport && (
        <Notice tone="warn" title="商品还没有分析结果">
          先只查通用的违规说法。
        </Notice>
      )}
      <div className="gy-pdgrid">
        <div className="gy-pjcol">
          {step === 1 ? (
            stepOne
          ) : step === 2 ? (
            stepTwo
          ) : step === 3 ? (
            <StepStoryboard flow={f} apply={apply} reload={q.refetch} go={go} />
          ) : (
            <StepOutput flow={f} lane={remakeLane(f, go)} reload={q.refetch} go={go} />
          )}
        </div>
        {sideRail}
      </div>

      {picker === 'product' && (
        <ProductPicker
          selected={f.product.anchorId}
          onClose={() => setPicker(null)}
          onPick={(x) => {
            setPicker(null);
            if (x.group.assets.some((a) => a.id === f.product.anchorId)) return;
            setPending({ kind: 'product', anchorId: x.anchorId, name: x.group.productName });
          }}
        />
      )}
      {picker === 'reference' && (
        <ReferencePicker
          selectedId={ref.assetId}
          onClose={() => setPicker(null)}
          onPick={(x) => {
            setPicker(null);
            if (x.assetId === ref.assetId) return;
            setPending({ kind: 'reference', assetId: x.assetId, name: x.name });
          }}
        />
      )}
      {pending && (
        <Dialog
          title={pending.kind === 'product' ? '换商品' : '换参考视频'}
          onClose={() => !busy && setPending(null)}
          footer={
            <>
              <Btn variant="ghost" disabled={busy} onClick={() => setPending(null)}>
                取消
              </Btn>
              <Btn
                variant="primary"
                busy={busy}
                onClick={() =>
                  void run(
                    async () => {
                      const next =
                        pending.kind === 'product'
                          ? await put<Flow>(`/clients/${client.id}/projects/${id}/product`, {
                              anchorId: pending.anchorId,
                              revision: f.revision,
                            })
                          : await put<Flow>(`/clients/${client.id}/projects/${id}/reference`, {
                              assetId: pending.assetId,
                              revision: f.revision,
                            });
                      apply(next);
                      setPending(null);
                    },
                    pending.kind === 'product'
                      ? `已换成「${pending.name}」`
                      : `参考视频已换成「${pending.name}」`,
                  )
                }
              >
                确认换
              </Btn>
            </>
          }
        >
          <p>
            {pending.kind === 'product'
              ? `换成「${pending.name}」以后，分镜要重新确认；选过的人群会清空。已经出过的版本不受影响。`
              : `换成「${pending.name}」以后，分镜会按新的参考视频重新来，之前写的“改成”会清空。已经出过的版本不受影响。`}
          </p>
          {err && <Notice tone="error">{err}</Notice>}
        </Dialog>
      )}
    </div>
  );
}

/** 复刻整个项目只有一条出片线 */
function remakeLane(f: Flow, go: (s: Step) => void): Lane {
  return {
    versions: f.versions,
    draftSegments: f.draftSegments,
    ready: f.storyboard.confirmed,
    duration: f.targetDuration,
    hook: f.reference.hook ?? '',
    personaName: f.settings.personaName,
    notReady: {
      msg: '分镜待确认。',
      actions: (
        <Btn variant="primary" onClick={() => go(3)}>
          去确认分镜
        </Btn>
      ),
    },
  };
}
