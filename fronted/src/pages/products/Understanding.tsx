import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Sparkles } from 'lucide-react';
import { post, put, request } from '../../api';
import { useWorkspace } from '../../components/UI';
import { Btn, Card, CardHead, Dialog, Notice } from '../../gy/ui';
import {
  HOOKS,
  SECTIONS,
  type Persona,
  type SectionKey,
  type Understanding,
  type UnderstandingContent,
} from './data';

function useUnderstanding(anchor: string) {
  const { client } = useWorkspace();
  const cache = useQueryClient();
  const key = [client.id, 'product-understanding', anchor];
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      request<Understanding>(`/clients/${client.id}/product-groups/${anchor}/understanding`),
  });
  return {
    query,
    base: `/clients/${client.id}/product-groups/${anchor}`,
    set: (u: Understanding) => {
      cache.setQueryData(key, u);
      void cache.invalidateQueries({ queryKey: [client.id, 'product-library'] });
    },
  };
}

const sourceText = (u: Understanding) =>
  u.source === 'EMPTY'
    ? '还没有商品分析'
    : !u.saved
      ? '来源：商品分析自动整理 · 还没保存，改任何一处就会保存'
      : u.source === 'AI'
        ? '来源：AI 根据商品分析重新提取'
        : u.source === 'DERIVED'
          ? '来源：根据商品分析重新整理'
          : `来源：商品分析 + 人工修改${u.editedCount ? ` · 人工改过 ${u.editedCount} 次` : ''}`;

/** 「商品理解」卡：六类标签，点标签改字、× 删除、最后一格回车添加。 */
export function UnderstandingCard({ anchor }: { anchor: string }) {
  const { notify } = useWorkspace();
  const { query, base, set } = useUnderstanding(anchor);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [confirmExtract, setConfirmExtract] = useState(false);
  const [error, setError] = useState('');
  const u = query.data;
  if (query.isPending)
    return (
      <Card pad>
        <span className="gy-muted">正在加载商品理解…</span>
      </Card>
    );
  if (query.error || !u)
    return (
      <Notice tone="error" title="商品理解没加载出来">
        {(query.error as Error)?.message}
      </Notice>
    );
  const save = async (next: UnderstandingContent) => {
    setBusy(true);
    setError('');
    try {
      set(
        await put<Understanding>(`${base}/understanding`, {
          understanding: next,
          revision: u.revision,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
      void query.refetch();
    } finally {
      setBusy(false);
    }
  };
  const change = (k: SectionKey, fn: (list: string[]) => string[]) =>
    void save({ ...u.understanding, [k]: fn(u.understanding[k] ?? []) });
  const extract = async () => {
    setConfirmExtract(false);
    setExtracting(true);
    setError('');
    try {
      set(await post<Understanding>(`${base}/understanding/extract`, { revision: u.revision }));
      notify(u.aiEnabled ? '已让 AI 重新提取商品理解' : '已按商品分析重新整理');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExtracting(false);
    }
  };
  return (
    <Card pad className="gy-ukcard" role="region" aria-label="商品理解">
      <CardHead title="商品理解">
        <small>{sourceText(u)}</small>
        <Btn
          size="xs"
          disabled={!u.hasAnalysis || busy}
          busy={extracting}
          onClick={() => (u.saved && u.editedCount ? setConfirmExtract(true) : void extract())}
        >
          {!extracting && <Sparkles size={14} aria-hidden="true" />}
          {extracting ? '正在重新提取…' : u.aiEnabled ? '让 AI 重新提取' : '按分析重新整理'}
        </Btn>
      </CardHead>
      <span className="gy-fine">
        做视频时，开头钩子、每个镜头的任务都按这里来写。点标签可以改字，×
        删掉，最后一格输入后回车添加。资料里没有的价格、功效数据不会写进来。
      </span>
      {!u.hasAnalysis && (
        <Notice>这个商品还没有分析结果。分析完成后会自动整理在这里，现在也可以手动添加。</Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <div className={`gy-ukgrid${extracting ? ' busy' : ''}`}>
        {SECTIONS.map(([k, label, hint]) => (
          <div className="gy-ukrow" key={k}>
            <span className="cn">
              {label}
              <small>{hint}</small>
            </span>
            <div className="gy-chips">
              {(u.understanding[k] ?? []).map((t, i) =>
                editing === `${k}:${i}` ? (
                  <TagInput
                    key={`${k}:${i}`}
                    label={`修改${label}`}
                    initial={t}
                    onDone={(v) => {
                      setEditing(null);
                      if (v !== null && v.trim() && v.trim() !== t)
                        change(k, (l) => l.map((x, n) => (n === i ? v.trim() : x)));
                    }}
                  />
                ) : (
                  <span
                    key={`${k}:${i}:${t}`}
                    className={`gy-tag${k === 'core' ? ' core' : k === 'obj' ? ' warn' : ''}`}
                  >
                    <button
                      type="button"
                      className="t"
                      title="点一下修改"
                      disabled={busy}
                      onClick={() => setEditing(`${k}:${i}`)}
                    >
                      {t}
                    </button>
                    <button
                      type="button"
                      className="x"
                      aria-label={`删除 ${t}`}
                      disabled={busy}
                      onClick={() => change(k, (l) => l.filter((_, n) => n !== i))}
                    >
                      ×
                    </button>
                  </span>
                ),
              )}
              {(u.understanding[k] ?? []).length < 12 && (
                <AddInput
                  label={`添加${label}，回车确认`}
                  disabled={busy}
                  onAdd={(v) => {
                    if ((u.understanding[k] ?? []).includes(v)) return notify('这个标签已经有了');
                    change(k, (l) => [...l, v]);
                  }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      {confirmExtract && (
        <Dialog
          title="重新提取商品理解"
          onClose={() => setConfirmExtract(false)}
          footer={
            <>
              <Btn variant="ghost" onClick={() => setConfirmExtract(false)}>
                取消
              </Btn>
              <Btn variant="primary" onClick={() => void extract()}>
                重新提取
              </Btn>
            </>
          }
        >
          <p className="gy-muted">
            重新提取会替换现在的标签，人工改过的 {u.editedCount} 次修改不会保留。
          </p>
        </Dialog>
      )}
    </Card>
  );
}

function TagInput({
  label,
  initial,
  onDone,
}: {
  label: string;
  initial: string;
  onDone: (v: string | null) => void;
}) {
  const [v, setV] = useState(initial);
  const [done, setDone] = useState(false);
  const finish = (ok: boolean) => {
    if (done) return;
    setDone(true);
    onDone(ok ? v : null);
  };
  return (
    <label className="gy-inline-add wide">
      <input
        aria-label={label}
        autoFocus
        maxLength={60}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish(true);
          if (e.key === 'Escape') finish(false);
        }}
        onBlur={() => finish(true)}
      />
    </label>
  );
}
function AddInput({
  label,
  onAdd,
  disabled,
}: {
  label: string;
  onAdd: (v: string) => void;
  disabled?: boolean;
}) {
  const [v, setV] = useState('');
  return (
    <label className="gy-inline-add">
      <input
        aria-label={label}
        placeholder="+ 添加"
        maxLength={60}
        disabled={disabled}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing && v.trim()) {
            onAdd(v.trim());
            setV('');
          }
        }}
      />
    </label>
  );
}

const FIELDS = [
  ['pain', '痛点'],
  ['want', '想要的'],
  ['tone', '说话风格'],
  ['scene', '常见场景'],
  ['worry', '顾虑'],
] as const;
const blank: Persona = {
  id: null,
  name: '',
  pain: '',
  want: '',
  tone: '',
  scene: '',
  worry: '',
  hooks: [],
  revision: 0,
};

/** 「目标人群」：挂在商品上，增删改。 */
export function PersonasCard({ anchor }: { anchor: string }) {
  const { notify } = useWorkspace();
  const { query, base, set } = useUnderstanding(anchor);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState<Persona>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const u = query.data;
  if (!u) return null;
  const list = u.personas;
  const run = async (fn: () => Promise<Understanding>, done: string) => {
    setBusy(true);
    setError('');
    try {
      set(await fn());
      setEditing(null);
      setDeleting(null);
      notify(done);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const persona = (p: Persona) => ({
    name: p.name,
    pain: p.pain,
    want: p.want,
    tone: p.tone,
    scene: p.scene,
    worry: p.worry,
    hooks: p.hooks,
  });
  const saveDraft = () => {
    if (!draft.name.trim()) return setError('先填人群名称');
    if (editing === 'new')
      void run(
        () => post<Understanding>(`${base}/personas`, persona(draft)),
        `已新增人群「${draft.name.trim()}」`,
      );
    else
      void run(
        () =>
          put<Understanding>(`${base}/personas/${draft.id}`, {
            persona: persona(draft),
            revision: draft.revision,
          }),
        '人群已保存',
      );
  };
  const form = (
    <div className="gy-pscard editing" key="form">
      <label className="gy-psf">
        <span>
          名称<em style={{ color: 'var(--gy-danger)', fontStyle: 'normal' }}> *</em>
        </span>
        <input
          className="gy-input"
          maxLength={30}
          value={draft.name}
          placeholder="例如 通勤上班族"
          aria-label="人群名称"
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </label>
      {FIELDS.map(([k, label]) => (
        <label className="gy-psf" key={k}>
          <span>{label}</span>
          <textarea
            className="gy-textarea"
            rows={2}
            maxLength={300}
            aria-label={label}
            value={draft[k]}
            onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
          />
        </label>
      ))}
      <div className="gy-psf">
        <span>适合的开头（可多选）</span>
        <div className="gy-cops" role="group" aria-label="适合的开头">
          {HOOKS.map((h) => (
            <button
              type="button"
              key={h}
              aria-pressed={draft.hooks.includes(h)}
              onClick={() =>
                setDraft({
                  ...draft,
                  hooks: draft.hooks.includes(h)
                    ? draft.hooks.filter((x) => x !== h)
                    : [...draft.hooks, h],
                })
              }
            >
              {h}
            </button>
          ))}
        </div>
      </div>
      <div className="gy-row">
        <Btn variant="ghost" size="xs" onClick={() => setEditing(null)}>
          取消
        </Btn>
        <Btn variant="primary" size="xs" busy={busy} onClick={saveDraft}>
          保存
        </Btn>
      </div>
    </div>
  );
  return (
    <Card pad role="region" aria-label="目标人群">
      <CardHead title="目标人群">
        <small>{u.personasSaved ? `${list.length} 个人群` : `${list.length} 个建议`}</small>
        <Btn
          size="xs"
          disabled={editing !== null}
          onClick={() => {
            setDraft(blank);
            setError('');
            setEditing('new');
          }}
        >
          <Plus size={14} aria-hidden="true" />
          新增人群
        </Btn>
      </CardHead>
      <span className="gy-fine">
        人群挂在这个商品上，用这个商品的所有项目共用。做视频时「给谁看」就从这里选；改了这里，之后新选的方向都会用新的。
      </span>
      {!u.personasSaved && list.length > 0 && (
        <Notice
          title="下面是根据商品分析整理的建议人群，还没保存"
          actions={
            <Btn
              size="xs"
              variant="primary"
              busy={busy}
              onClick={() =>
                void run(() => post<Understanding>(`${base}/personas/adopt`, {}), '已采用建议人群')
              }
            >
              采用这些人群
            </Btn>
          }
        >
          采用后可以编辑和删除；直接新增人群也会一起采用。
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {list.length || editing === 'new' ? (
        <div className="gy-psgrid">
          {list.map((p, i) =>
            editing === i ? (
              form
            ) : (
              <div className={`gy-pscard${u.personasSaved ? '' : ' draft'}`} key={p.id ?? `s${i}`}>
                <b>
                  {p.name}
                  {!u.personasSaved && <span className="gy-mini">建议</span>}
                </b>
                <dl>
                  {FIELDS.map(([k, label]) => (
                    <div key={k} style={{ display: 'contents' }}>
                      <dt>{label}</dt>
                      <dd>{p[k] || '—'}</dd>
                    </div>
                  ))}
                  <dt>适合的开头</dt>
                  <dd>
                    <span className="gy-dchips">
                      {p.hooks.length ? p.hooks.map((h) => <i key={h}>{h}</i>) : '—'}
                    </span>
                  </dd>
                </dl>
                {u.personasSaved && p.id && (
                  <div className="gy-row">
                    {deleting === p.id ? (
                      <>
                        <Btn variant="ghost" size="xs" onClick={() => setDeleting(null)}>
                          不删了
                        </Btn>
                        <Btn
                          size="xs"
                          danger
                          busy={busy}
                          onClick={() =>
                            void run(
                              () =>
                                request<Understanding>(`${base}/personas/${p.id}`, {
                                  method: 'DELETE',
                                }),
                              `已删除人群「${p.name}」`,
                            )
                          }
                        >
                          确认删除
                        </Btn>
                      </>
                    ) : (
                      <>
                        <Btn
                          variant="ghost"
                          size="xs"
                          disabled={editing !== null}
                          onClick={() => setDeleting(p.id!)}
                        >
                          删除
                        </Btn>
                        <Btn
                          size="xs"
                          disabled={editing !== null}
                          onClick={() => {
                            setDraft({ ...p });
                            setError('');
                            setEditing(i);
                          }}
                        >
                          编辑
                        </Btn>
                      </>
                    )}
                  </div>
                )}
              </div>
            ),
          )}
          {editing === 'new' && form}
        </div>
      ) : (
        <div className="gy-muted" style={{ padding: '16px 0' }}>
          还没有人群。点「新增人群」加一个。
        </div>
      )}
    </Card>
  );
}
