import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Pencil } from 'lucide-react';
import { fileUrl, jobUrl, post, put } from '../../api';
import { useWorkspace } from '../../components/UI';
import { Btn, Card, Dialog, Notice } from '../../gy/ui';
import { folderPath, InlineName, orderedFolders, type Folder } from '../../gy/folders';
import { adCheck, AD_CAT_LABEL, type AdContext } from '../../adcheck';
import ProductPicker from './ProductPicker';
import { ProductButton, RatioPicker, TopBar, type Step } from './parts';
import StepDirections, { DirectionCard, DirectionForm, cleanData } from './StepDirections';
import StepDirBoard, { DirTabs } from './StepDirBoard';
import StepOutput, { type Lane } from './StepOutput';
import {
  formatRR,
  LETTERS,
  MODE_LABEL,
  oneClickDiff,
  oneClickTags,
  pickedDirections,
  shortTime,
  sourceLabel,
  useRefreshProjects,
  versionRunning,
  versionState,
  type DirectionData,
  type DirectionRow,
  type ModeFlow,
  type OneClickSettings,
  type Version,
} from './data';

function defaultStep(f: ModeFlow): Step {
  if (f.mode === 'ONE_CLICK') return 4;
  const picked = pickedDirections(f);
  if (f.versions.length || (picked.length && picked.every((d) => d.board.confirmed))) return 4;
  if (picked.length) return 3;
  return 2;
}
const blankOneClick: OneClickSettings = {
  personaName: '',
  duration: 15,
  src: 'idea',
  copy: '',
  creative: '',
  people: '',
  voice: '',
  tempo: '',
  look: '',
};

/** 框架模式 / 简易的四步详情：商品 → 方向 → 分镜 → 出片（和复刻同一套步骤条、顶部操作栏、右侧项目信息） */
export default function ModeDetail({
  flow: f,
  apply,
  reload,
  folders,
}: {
  flow: ModeFlow;
  apply: (next: ModeFlow) => void;
  reload: () => Promise<unknown>;
  folders: Folder[];
}) {
  const { client, notify } = useWorkspace();
  const navigate = useNavigate();
  const refresh = useRefreshProjects();
  const [params, setParams] = useSearchParams();
  const p = f.project;
  const id = p.id;
  const oneClick = f.mode === 'ONE_CLICK';
  const picked = pickedDirections(f);
  const stepParam = Number(params.get('step'));
  const step: Step = [1, 2, 3, 4].includes(stepParam) ? (stepParam as Step) : defaultStep(f);
  const dirParam = params.get('dir') ?? '';
  const dir = picked.some((d) => d.id === dirParam) ? dirParam : (picked[0]?.id ?? '');
  const compare = params.get('dir') === 'compare' && picked.length > 1;
  const go = (s: Step, d?: string) => {
    const next = new URLSearchParams(params);
    next.set('step', String(s));
    if (d) next.set('dir', d);
    setParams(next, { replace: false });
    window.scrollTo?.({ top: 0 });
  };
  const setDir = (d: string) => {
    const next = new URLSearchParams(params);
    next.set('dir', d);
    setParams(next, { replace: true });
  };
  const [renaming, setRenaming] = useState(false);
  const [picker, setPicker] = useState(false);
  const [pending, setPending] = useState<{ anchorId: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const savedOc = f.settings.oneClick ?? blankOneClick;
  const [oc, setOc] = useState<OneClickSettings>(savedOc);
  const savedOcKey = JSON.stringify(savedOc);
  useEffect(() => setOc(JSON.parse(savedOcKey)), [id, savedOcKey]);
  const ocDirty = JSON.stringify(oc) !== savedOcKey;
  const [ocEdit, setOcEdit] = useState<{ id: string; data: DirectionData } | null>(null);
  const ctx: AdContext = useMemo(
    () => ({ hasPrice: f.product.analysis.hasPrice, risks: f.product.analysis.risks }),
    [f.product.analysis],
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
        await put<ModeFlow>(`/clients/${client.id}/projects/${id}/settings`, {
          revision: f.revision,
          ...body,
        }),
      );
    }, done);

  // ---------- 步骤条 ----------
  const running = f.versions.filter(versionRunning);
  const ocDir = oneClick ? picked[0] : undefined;
  const confirmedBoards = picked.filter((d) => d.board.confirmed).length;
  const steps: [string, string, 'done' | 'now' | 'wait'][] = oneClick
    ? [
        ['商品', `${f.product.name} · 事实已核对`, 'done'],
        [
          '方向',
          ocDir
            ? `「${ocDir.data.title}」${ocDir.source === 'AI' ? '' : ' · 模板'}`
            : '出片时自动写',
          ocDir ? 'done' : 'wait',
        ],
        [
          '分镜',
          ocDir ? `自动写了 ${ocDir.board.shots.length} 个镜头` : '出片时自动写',
          ocDir ? 'done' : 'wait',
        ],
        [
          '出片',
          running.length
            ? `第 ${running[0].no} 版出片中`
            : f.versions.length
              ? `${f.versions.length} 个版本`
              : '待出片',
          'now',
        ],
      ]
    : [
        ['商品', `${f.product.name} · 事实已核对`, 'done'],
        [
          '方向',
          picked.length > 1
            ? `同时测 ${picked.length} 个方向`
            : picked.length
              ? `「${picked[0].data.title}」`
              : f.directions.length
                ? `${f.directions.length} 套方向 · 还没选`
                : '还没出方向',
          picked.length ? 'done' : 'now',
        ],
        [
          '分镜',
          !picked.length
            ? '选好方向后写'
            : confirmedBoards === picked.length
              ? `${picked.length} 份分镜 · 已确认`
              : `${confirmedBoards}/${picked.length} 份已确认`,
          !picked.length ? 'wait' : confirmedBoards === picked.length ? 'done' : 'now',
        ],
        [
          '出片',
          running.length
            ? `${running.length} 版出片中`
            : f.versions.length
              ? `${picked.length > 1 ? `${picked.length} 个方向 · ` : ''}${f.versions.length} 个版本`
              : confirmedBoards
                ? '可以出第一版'
                : '待确认分镜',
          running.length || (confirmedBoards && !f.versions.length)
            ? 'now'
            : f.versions.length
              ? 'done'
              : 'wait',
        ],
      ];

  // ---------- 右侧项目信息 ----------
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
                await Promise.all([refresh(), reload()]);
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
        <dt>方向</dt>
        <dd>
          {picked.length
            ? picked
                .map((d, k) => `${picked.length > 1 ? LETTERS[k] + ' ' : ''}${d.data.title}`)
                .join('、')
            : oneClick
              ? '出片时自动写'
              : '还没选'}
        </dd>
        <dt>时长</dt>
        <dd>
          {oneClick
            ? `${oc.duration} 秒`
            : picked.length
              ? [...new Set(picked.map((d) => `${d.data.duration} 秒`))].join(' / ')
              : `${f.settings.duration} 秒（出方向时选）`}
        </dd>
        <dt>已出</dt>
        <dd>
          {f.versions.length} 版 · 可投放{' '}
          {f.versions.filter((v) => v.verdict?.use === 'USABLE').length}
        </dd>
        <dt>创建</dt>
        <dd>{shortTime(p.createdAt)}</dd>
      </dl>
      <div className="gy-next">
        <b>现在要做</b>
        {oneClick
          ? f.versions.length
            ? '审片'
            : '填设置，开始出片'
          : step === 2
            ? '出方向、选方向'
            : step === 3
              ? '确认分镜'
              : '等出片'}
      </div>
    </aside>
  );

  // ---------- 第 1 步 商品 ----------
  const stepOne = (
    <>
      <TopBar
        actions={
          <Btn variant="primary" onClick={() => go(oneClick ? 4 : 2)}>
            {oneClick ? '下一步：设置和出片' : '下一步：方向'}
          </Btn>
        }
      >
        这个项目用 <b>{f.product.name}</b>。
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
          onClick={() => setPicker(true)}
        />
        <details className="gy-facts">
          <summary>这个项目用的商品事实</summary>
          <p>{f.settings.facts}</p>
        </details>
      </Card>
    </>
  );

  // ---------- 简易：方向（自动写的，可以看、可以改） ----------
  const ocDirections = ocEdit ? (
    <>
      <TopBar
        actions={
          <>
            <Btn variant="ghost" disabled={busy} onClick={() => setOcEdit(null)}>
              取消
            </Btn>
            <Btn
              variant="primary"
              busy={busy}
              onClick={() =>
                void run(async () => {
                  apply(
                    await put<ModeFlow>(
                      `/clients/${client.id}/projects/${id}/directions/${ocEdit.id}`,
                      {
                        revision: ocDir?.revision ?? 0,
                        direction: cleanData(ocEdit.data),
                      },
                    ),
                  );
                  setOcEdit(null);
                }, '方向已保存')
              }
            >
              保存这个方向
            </Btn>
          </>
        }
      >
        正在改方向。
      </TopBar>
      {ocDir && (
        <DirectionForm
          value={ocEdit.data}
          origin={ocDir.origin}
          flow={f}
          ctx={ctx}
          onChange={(data) => setOcEdit({ ...ocEdit, data })}
        />
      )}
    </>
  ) : (
    <>
      <TopBar
        actions={
          <>
            {ocDir && (
              <Btn
                disabled={busy}
                onClick={() =>
                  setOcEdit({
                    id: ocDir.id,
                    data: { ...ocDir.data, points: [...ocDir.data.points] },
                  })
                }
              >
                改格子
              </Btn>
            )}
            <Btn variant="primary" onClick={() => go(4)}>
              {ocDir ? '回到出片' : '去出片'}
            </Btn>
          </>
        }
      >
        {ocDir
          ? `出片时自动写的方向${sourceLabel(ocDir.source) ? ` · ${sourceLabel(ocDir.source)}` : ''}。可以改，不用确认。`
          : '还没出片。'}
      </TopBar>
      {ocDir ? (
        <Card className="gy-pjs">
          <h3>
            这次用的方向
          </h3>
          <DirectionCard d={ocDir} ctx={ctx} busy={busy} />
        </Card>
      ) : (
        <Card className="gy-pjs gy-lockc">
          <b>还没有方向</b>
        </Card>
      )}
    </>
  );

  // ---------- 出片 ----------
  const versionsOf = (d: DirectionRow) => f.versions.filter((v) => v.directionId === d.id);
  const frameworkLane = (d: DirectionRow, k: number): Lane => ({
    directionId: d.id,
    versions: versionsOf(d),
    draftSegments: d.board.draftSegments,
    ready: d.board.confirmed,
    duration: d.board.duration,
    hook: d.data.hook,
    personaName: d.data.personaName,
    notReady: {
      msg: `${picked.length > 1 ? `${LETTERS[k]} ` : ''}「${d.data.title}」的分镜待确认。`,
      actions: (
        <Btn variant="primary" onClick={() => go(3, d.id)}>
          去确认分镜
        </Btn>
      ),
    },
  });
  const copyHits = adCheck(oc.src === 'copy' ? oc.copy : oc.creative, ctx);
  const ocBlocked = oc.src === 'copy' && !oc.copy.trim() ? '先把文案填上' : '';
  const ocLane: Lane = {
    directionId: ocDir?.id,
    versions: f.versions,
    draftSegments: ocDir?.board.draftSegments ?? [],
    ready: !!ocDir?.board.confirmed,
    duration: ocDir?.board.duration ?? oc.duration,
    hook: ocDir?.data.hook ?? '',
    personaName: ocDir?.data.personaName ?? oc.personaName,
    notReady: { msg: '', actions: null },
    idle: (open) => {
      const n = (f.versions[0]?.jobNo ?? f.versions[0]?.no ?? 0) + 1;
      const fresh =
        !ocDir || ocDirty || JSON.stringify(f.versions[0]?.oneClick ?? null) !== JSON.stringify(oc);
      return {
        msg: ocBlocked ? (
          <span className="gy-warntext">{ocBlocked}</span>
        ) : f.versions.length ? (
          <>
            已出 {f.versions.length} 版。
          </>
        ) : (
          <>填好设置，开始出片。</>
        ),
        actions: (
          <>
            {copyHits.length > 0 && (
              <span className="gy-adwarn">
                {oc.src === 'copy' ? '文案' : '创意要求'}里有 {copyHits.length} 处可能违规的说法
              </span>
            )}
            {ocDirty && (
              <Btn disabled={busy} onClick={() => void settings({ oneClick: oc }, '设置已保存')}>
                保存设置
              </Btn>
            )}
            <Btn
              variant="primary"
              disabled={!!ocBlocked || busy}
              onClick={() =>
                open({
                  segments: [],
                  note: '',
                  basedOn: null,
                  msg: `${fresh ? '按现在的设置重写方向和分镜，' : '用现在的方向和分镜，'}出第 ${n} 版（${formatRR(f.settings)} · ${oc.duration} 秒）`,
                  run: () =>
                    post<Version>(`/clients/${client.id}/projects/${id}/one-click/run`, {
                      revision: f.revision,
                      settings: oc,
                    }),
                })
              }
            >
              {f.versions.length ? '再出一版' : '开始出片'}
            </Btn>
          </>
        ),
      };
    },
    before: <OneClickSettingsCard flow={f} value={oc} onChange={setOc} ctx={ctx} dirty={ocDirty} />,
    extra: (v, prev) => {
      const diff = prev ? oneClickDiff(prev.oneClick, v.oneClick) : [];
      return (
        <>
          <span className="gy-vtags">
            {oneClickTags(v.oneClick).map((t) => (
              <i key={t}>{t}</i>
            ))}
          </span>
          {prev && diff.length > 0 && (
            <span className="gy-fine">
              设置比第 {prev.no} 版：{diff.join('；')}
            </span>
          )}
        </>
      );
    },
  };

  let body: React.ReactNode;
  if (step === 1) body = stepOne;
  else if (step === 2)
    body = oneClick ? ocDirections : <StepDirections key={id} flow={f} apply={apply} go={go} />;
  else if (step === 3)
    body = (
      <StepDirBoard key={`${id}:${dir}`} flow={f} apply={apply} go={go} dir={dir} setDir={setDir} />
    );
  else if (oneClick) body = <StepOutput key={id} flow={f} lane={ocLane} reload={reload} go={go} />;
  else if (!picked.length)
    body = (
      <>
        <TopBar
          actions={
            <Btn variant="primary" onClick={() => go(2)}>
              去选方向
            </Btn>
          }
        >
          还没选方向。
        </TopBar>
        <Card className="gy-pjs gy-lockc">
          <b>还没出片</b>
        </Card>
      </>
    );
  else {
    const k = Math.max(
      0,
      picked.findIndex((d) => d.id === dir),
    );
    const tabs =
      picked.length > 1 ? (
        <DirTabs
          flow={f}
          cur={dir}
          compare={compare}
          onCompare={() => setDir('compare')}
          onPick={setDir}
          badge={(d) =>
            versionsOf(d).some(versionRunning) ? <span className="sp2" aria-label="出片中" /> : null
          }
        />
      ) : null;
    body = compare ? (
      <>
        <TopBar>
          {running.length
            ? `${running.length} 个方向正在出片。`
            : `${picked.length} 个方向放在一起看。`}
        </TopBar>
        {tabs}
        <DirCompare flow={f} onOpen={setDir} />
      </>
    ) : (
      <>
        {/* 顶部操作栏由 StepOutput 渲染，方向切换放在它下面 */}
        <StepOutput
          key={`${id}:${dir}`}
          flow={f}
          lane={{ ...frameworkLane(picked[k], k), before: tabs }}
          reload={reload}
          go={go}
        />
      </>
    );
  }

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
                  await Promise.all([reload(), refresh()]);
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
        <div className="gy-pjcol">{body}</div>
        {sideRail}
      </div>
      {picker && (
        <ProductPicker
          selected={f.product.anchorId}
          onClose={() => setPicker(false)}
          onPick={(x) => {
            setPicker(false);
            if (x.group.assets.some((a) => a.id === f.product.anchorId)) return;
            setPending({ anchorId: x.anchorId, name: x.group.productName });
          }}
        />
      )}
      {pending && (
        <Dialog
          title="换商品"
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
                  void run(async () => {
                    apply(
                      await put<ModeFlow>(`/clients/${client.id}/projects/${id}/product`, {
                        anchorId: pending.anchorId,
                        revision: f.revision,
                      }),
                    );
                    setPending(null);
                  }, `已换成「${pending.name}」`)
                }
              >
                确认换
              </Btn>
            </>
          }
        >
          <p>
            换成「{pending.name}」以后，
            {oneClick
              ? '下次出片会按新商品重新写方向和分镜；选过的人群会清空。'
              : '已写的分镜要重新确认，已出的方向会标出是按旧商品写的，可以重出；选过的人群会清空。'}
            已经出过的版本不受影响。
          </p>
          {err && <Notice tone="error">{err}</Notice>}
        </Dialog>
      )}
    </div>
  );
}

/** 简易的设置：出发点、时长、给谁看、创意要求 / 文案，更多设置里是出镜人物、台词和声音、节奏、片种 */
function OneClickSettingsCard({
  flow,
  value: o,
  onChange,
  ctx,
  dirty,
}: {
  flow: ModeFlow;
  value: OneClickSettings;
  onChange: (v: OneClickSettings) => void;
  ctx: AdContext;
  dirty: boolean;
}) {
  const [more, setMore] = useState(false);
  const set = (patch: Partial<OneClickSettings>) => onChange({ ...o, ...patch });
  const opt = flow.options;
  const seg = (label: string, key: 'people' | 'voice' | 'tempo' | 'look', options: string[]) => (
    <span className="gy-ocg">
      <span>{label}</span>
      <span className="gy-seg" role="group" aria-label={label}>
        {['', ...options].map((v) => (
          <button
            key={v || 'ai'}
            type="button"
            aria-pressed={o[key] === v}
            onClick={() => set({ [key]: v })}
          >
            {v || (flow.aiEnabled ? '交给 AI' : '默认')}
          </button>
        ))}
      </span>
    </span>
  );
  const text = o.src === 'copy' ? o.copy : o.creative;
  const hits = adCheck(text, ctx);
  const advOn = (['people', 'voice', 'tempo', 'look'] as const)
    .filter((k) => o[k])
    .map((k) => o[k]);
  return (
    <Card className="gy-pjs gy-ocset" aria-label="出片设置">
      <h3>
        出片设置
        <small>
          {dirty ? '未保存' : ''}
        </small>
      </h3>
      <div className="gy-ocrow">
        <span className="gy-ocg">
          <span>出发点</span>
          <span className="gy-seg" role="group" aria-label="出发点">
            <button
              type="button"
              aria-pressed={o.src === 'idea'}
              onClick={() => set({ src: 'idea' })}
            >
              {flow.aiEnabled ? '让 AI 构思' : '按商品资料来'}
            </button>
            <button
              type="button"
              aria-pressed={o.src === 'copy'}
              onClick={() => set({ src: 'copy' })}
            >
              我有文案
            </button>
          </span>
        </span>
        <span className="gy-ocg">
          <span>时长</span>
          <span className="gy-seg" role="group" aria-label="时长">
            {opt.durations.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={o.duration === d}
                onClick={() => set({ duration: d })}
              >
                {d} 秒
              </button>
            ))}
          </span>
        </span>
        <span className="gy-ocg">
          <span>给谁看</span>
          <select
            className="gy-select"
            aria-label="给谁看"
            value={o.personaName}
            onChange={(e) => set({ personaName: e.target.value })}
          >
            <option value="">{flow.aiEnabled ? '交给 AI 挑' : '不指定'}</option>
            {flow.product.personas.map((p) => (
              <option key={p.id ?? p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </span>
      </div>
      <label className="gy-ocbox">
        <span className="hd2">{o.src === 'copy' ? '文案（口播原文）' : '创意要求（选填）'}</span>
        <textarea
          className="gy-textarea"
          rows={4}
          maxLength={500}
          value={text}
          placeholder={
            o.src === 'copy'
              ? '一字不改地念出来，画面围绕它拍。例：出门不想配鞋？试试这双。'
              : '例：开箱风；结尾三个颜色排一排；语气轻松一点。留空就按商品资料来'
          }
          onChange={(e) =>
            set(o.src === 'copy' ? { copy: e.target.value } : { creative: e.target.value })
          }
        />
        <span className="gy-fine">
          {o.src === 'copy'
            ? '台词按句子顺序放进各镜，一个字不改。'
            : flow.aiEnabled
              ? ''
              : '没配置文字模型，这段只记在设置里。'}{' '}
          {text.length} / 500
        </span>
        {text.trim() &&
          (hits.length ? (
            <span className="gy-adlive bad" role="status">
              {hits.length} 处可能违规：
              {hits.map((h) => (
                <span className="hit" key={h.at}>
                  <mark className={`gy-adw ${h.cat}`}>{h.word}</mark>
                  <small>{AD_CAT_LABEL[h.cat]}</small>
                </span>
              ))}
            </span>
          ) : (
            <span className="gy-adlive ok">✓ 没发现可能违规的说法</span>
          ))}
      </label>
      <div className="gy-ocrow sep">
        <Btn size="xs" variant="ghost" aria-expanded={more} onClick={() => setMore(!more)}>
          {more ? '收起' : '更多设置'}
        </Btn>
        {!more && (
          <span className="gy-fine">
            {advOn.length
              ? `已定：${advOn.join(' · ')} · 其余交给 AI`
              : '出镜人物、台词和声音、节奏、片种都交给 AI'}
          </span>
        )}
      </div>
      {more && (
        <div className="gy-ocrow">
          {seg('出镜人物', 'people', opt.people)}
          {seg('台词和声音', 'voice', opt.voices)}
          {seg('节奏', 'tempo', opt.tempos)}
          {seg('片种', 'look', opt.looks)}
        </div>
      )}
    </Card>
  );
}

/** 出片步「对比几个方向」：每个方向最新一版放在一起看，不放任何投放数字 */
function DirCompare({ flow, onOpen }: { flow: ModeFlow; onOpen: (id: string) => void }) {
  const { client } = useWorkspace();
  const picked = pickedDirections(flow);
  return (
    <Card className="gy-pjs">
      <h3>
        同一个商品，{picked.length} 个方向放在一起看
        <small>每个方向最新的一版</small>
      </h3>
      <div
        className="gy-dcmp"
        style={{ gridTemplateColumns: `repeat(${picked.length}, minmax(0, 1fr))` }}
      >
        {picked.map((d, k) => {
          const vs = flow.versions.filter((v) => v.directionId === d.id);
          const last = vs[0];
          const [state, tone] = last ? versionState(last) : ['还没出片', 'idle'];
          return (
            <div className="col" key={d.id}>
              <div className="ch">
                <b>
                  {LETTERS[k]} · {d.data.title}
                </b>
                <small>
                  {d.data.duration} 秒 · {d.data.contentType} · 开头：{d.data.hook}
                  {d.data.personaName ? ` · 给「${d.data.personaName}」` : ''}
                </small>
              </div>
              {last?.hasOutput ? (
                <video
                  src={jobUrl(client.id, last.id)}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={`${d.data.title} 第 ${last.no} 版`}
                  className={last.ratio === '16:9' ? 'land' : ''}
                />
              ) : (
                <div className="gy-vgen off">
                  <b>{last && versionRunning(last) ? '出片中' : state}</b>
                  <small>
                    {last
                      ? last.message
                      : d.board.confirmed
                        ? '分镜已确认，可以出第一版'
                        : '分镜还没确认'}
                  </small>
                </div>
              )}
              <dl>
                <dt>版本</dt>
                <dd>
                  {last ? `第 ${last.no} 版${vs.length > 1 ? ` / 共 ${vs.length} 版` : ''}` : '—'}
                </dd>
                <dt>状态</dt>
                <dd>
                  <span
                    className={`gy-pill ${tone === 'ok' ? 'ok' : tone === 'bad' || tone === 'warn' ? 'warn' : 'idle'}`}
                  >
                    {state}
                  </span>
                </dd>
                <dt>评价</dt>
                <dd>
                  {last?.verdict?.rating
                    ? last.verdict.rating === 'GOOD'
                      ? '好'
                      : `差（${last.verdict.reason}）`
                    : '还没评'}
                </dd>
              </dl>
              <Btn size="xs" onClick={() => onOpen(d.id)}>
                去审片
              </Btn>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
