import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Plus, Sparkles, X } from 'lucide-react';
import { post, put, request } from '../../api';
import { useWorkspace } from '../../components/UI';
import type { Asset } from '../../types';
import { Btn, Card, Field, Notice, PageHead } from '../../gy/ui';
import { folderPath, useLibrary, useRefreshLibrary, type Analysis } from './data';

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];
type Stage = 'fill' | 'run';
type StepState = 'wait' | 'now' | 'done' | 'fail';

/** 新增商品：填写 → 上传并分析 → 核对结果（核对在 /products/:id/review）。 */
export default function ProductNew() {
  const { client } = useWorkspace();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { folders } = useLibrary();
  const refresh = useRefreshLibrary();
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [cover, setCover] = useState(0);
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [folderId, setFolderId] = useState(params.get('folder') ?? '');
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<Stage>('fill');
  const [steps, setSteps] = useState<StepState[]>(['wait', 'wait', 'wait', 'wait']);
  const [uploaded, setUploaded] = useState(0);
  const [error, setError] = useState('');
  const [anchor, setAnchor] = useState('');
  const [rejected, setRejected] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);
  useEffect(() => {
    if (!folders.length || !folderId) return;
    if (!folders.some((f) => f.id === folderId)) setFolderId('');
  }, [folders, folderId]);

  const add = (list: File[]) => {
    const ok = list.filter((f) => ACCEPT.includes(f.type));
    setRejected(ok.length < list.length ? '只能添加 JPG、PNG、WebP 图片，其他文件已跳过。' : '');
    if (ok.length) setFiles((cur) => [...cur, ...ok].slice(0, 30));
  };
  const filled = !!name.trim() && files.length > 0;
  const step = (i: number, s: StepState) => setSteps((cur) => cur.map((x, n) => (n === i ? s : x)));

  const start = async () => {
    setStage('run');
    setError('');
    setSteps(['now', 'wait', 'wait', 'wait']);
    setUploaded(0);
    const groupId = crypto.randomUUID();
    const created: Asset[] = [];
    try {
      for (const file of files) {
        const body = new FormData();
        body.set('file', file);
        body.set('kind', 'PRODUCT');
        body.set('sku', sku.trim());
        body.set('tags', '');
        body.set('productName', name.trim());
        body.set('productGroupId', groupId);
        created.push(
          await request<Asset>(`/clients/${client.id}/assets`, { method: 'POST', body }),
        );
        setUploaded(created.length);
      }
      step(0, 'done');
      step(1, 'now');
      const first = created[0].id;
      setAnchor(first);
      if (cover > 0 && created[cover])
        await put(`/clients/${client.id}/product-groups/${first}/cover`, {
          assetId: created[cover].id,
        });
      if (folderId) await put(`/clients/${client.id}/product-groups/${first}/folder`, { folderId });
      await refresh();
      step(1, 'done');
      step(2, 'now');
      await post<Analysis>(`/clients/${client.id}/product-groups/${first}/analysis`, { brief: '' });
      await poll(first);
    } catch (e) {
      if (!alive.current) return;
      setSteps((cur) => cur.map((x) => (x === 'now' ? 'fail' : x)));
      setError((e as Error).message);
      if (created.length) setAnchor(created[0].id);
      void refresh();
    }
  };
  const poll = async (first: string) => {
    for (;;) {
      if (!alive.current) return;
      const a = await request<Analysis>(`/clients/${client.id}/product-groups/${first}/analysis`);
      if (a.status === 'RUNNING') {
        step(2, 'done');
        step(3, 'now');
      }
      if (a.status === 'COMPLETED') {
        setSteps(['done', 'done', 'done', 'done']);
        await refresh();
        if (alive.current) navigate(`/products/${first}/review`);
        return;
      }
      if (a.status === 'FAILED')
        throw new Error(a.error || '分析没有成功，可以稍后在商品详情里重新分析');
      await new Promise((r) => setTimeout(r, 2000));
    }
  };

  const labels = [
    '上传商品图',
    '保存商品信息',
    '排队等待分析',
    '读取图片，整理外观、材质、卖点和要确认的信息',
  ];
  const small = [`${uploaded} / ${files.length}`, '', '', ''];
  return (
    <div className="gy-page gy-new">
      <button type="button" className="gy-backlink" onClick={() => navigate('/products')}>
        <ChevronLeft size={14} aria-hidden="true" />
        返回商品列表
      </button>
      <PageHead title="新增商品" />
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={ACCEPT.join(',')}
        aria-label="选择商品图"
        onChange={(e) => {
          add(Array.from(e.currentTarget.files ?? []));
          e.currentTarget.value = '';
        }}
      />
      <div className="gy-np2">
        <Card
          className="gy-upl"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            add(Array.from(e.dataTransfer.files));
          }}
        >
          {files.length ? (
            <>
              <div className="gy-uplh">
                <b>商品图</b>
                <span className="gy-muted">{files.length} 张 · 点图片设为封面</span>
                <Btn size="xs" onClick={() => input.current?.click()}>
                  继续添加
                </Btn>
              </div>
              <div className="gy-pics">
                {files.map((f, i) => (
                  <div className="gy-pic" key={`${f.name}-${f.size}-${i}`}>
                    <button
                      type="button"
                      className="pick"
                      aria-label={`把图片${i + 1}设为封面`}
                      aria-pressed={i === cover}
                      onClick={() => setCover(i)}
                    >
                      {previews[i] && (
                        <img
                          src={previews[i]}
                          alt={`图片${i + 1}`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      )}
                    </button>
                    {i === cover && <span className="main">封面</span>}
                    <span className="lab">图片{i + 1}</span>
                    <button
                      type="button"
                      className="rmx"
                      aria-label={`移除图片${i + 1}`}
                      onClick={() => {
                        setFiles((cur) => cur.filter((_, n) => n !== i));
                        setCover((c) => (i === c ? 0 : i < c ? c - 1 : c));
                      }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
                {files.length < 30 && (
                  <button type="button" className="add" onClick={() => input.current?.click()}>
                    <Plus size={18} aria-hidden="true" />
                    <span>添加图片</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            <button
              type="button"
              className={`gy-bigdrop${dragging ? ' dragging' : ''}`}
              onClick={() => input.current?.click()}
            >
              <span className="ic">
                <Plus size={24} aria-hidden="true" />
              </span>
              <b>{dragging ? '松开就能添加' : '把商品图拖到这里'}</b>
              <span>或点击选择，一次可以选多张 · JPG / PNG / WebP</span>
              <span className="gy-hint4" aria-hidden="true">
                <span>正面</span>
                <span>侧面</span>
                <span>细节</span>
                <span>吊牌 / 包装</span>
              </span>
              <small>建议 3–10 张，角度越全，分析越准</small>
            </button>
          )}
          {rejected && <Notice tone="warn">{rejected}</Notice>}
        </Card>
        <Card className="gy-npside">
          <h3>基本信息</h3>
          <Field label="商品名称" required htmlFor="np-name">
            <input
              id="np-name"
              className="gy-input"
              value={name}
              maxLength={100}
              placeholder="例如 新百伦鞋子"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="SKU" htmlFor="np-sku">
            <input
              id="np-sku"
              className="gy-input"
              value={sku}
              maxLength={100}
              placeholder="可后补"
              onChange={(e) => setSku(e.target.value)}
            />
          </Field>
          <Field label="放进文件夹" htmlFor="np-folder">
            <select
              id="np-folder"
              className="gy-select"
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
            >
              <option value="">未分类</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {folderPath(folders, f.id)}
                </option>
              ))}
            </select>
          </Field>
          <div className="gy-need3">
            <div className={name.trim() ? 'ok' : ''}>
              <i>{name.trim() ? '✓' : ''}</i>填写商品名称
            </div>
            <div className={files.length ? 'ok' : ''}>
              <i>{files.length ? '✓' : ''}</i>上传至少 1 张商品图
              {files.length ? `（已选 ${files.length} 张）` : ''}
            </div>
          </div>
          <div className="gy-grow" />
          <Btn
            variant="primary"
            wide
            disabled={!filled || stage === 'run'}
            onClick={() => void start()}
          >
            <Sparkles size={14} aria-hidden="true" />
            分析商品信息
          </Btn>
        </Card>
      </div>
      {stage === 'run' && (
        <div className="gy-overlay">
          <Card className="gy-dialog" role="dialog" aria-modal="true" aria-label="正在分析">
            <h3>{error ? '没能完成' : `正在处理 ${files.length} 张图片`}</h3>
            <div className="gy-steps">
              {labels.map((t, i) => (
                <div key={t} className={`gy-step ${steps[i]}`}>
                  <span className="gy-step-dot">
                    {steps[i] === 'done' ? '✓' : steps[i] === 'fail' ? '!' : ''}
                  </span>
                  {t}
                  {small[i] && <small>{small[i]}</small>}
                </div>
              ))}
            </div>
            {error ? (
              <>
                <Notice tone="error">{error}</Notice>
                <div className="gy-dialog-foot">
                  {anchor ? (
                    <Btn variant="primary" onClick={() => navigate(`/products/${anchor}`)}>
                      先保存，去商品详情
                    </Btn>
                  ) : (
                    <Btn variant="primary" onClick={() => setStage('fill')}>
                      返回修改
                    </Btn>
                  )}
                </div>
              </>
            ) : (
              <div className="gy-row" style={{ justifyContent: 'space-between' }}>
                <span className="gy-fine">
                  可以先离开，分析在后台继续。
                </span>
                {anchor && (
                  <Btn size="xs" variant="ghost" onClick={() => navigate(`/products/${anchor}`)}>
                    先去看商品
                  </Btn>
                )}
              </div>
            )}
          </Card>
        </div>
      )}
      {folderId && stage === 'fill' && (
        <span className="gy-fine">会放进「{folderPath(folders, folderId)}」。</span>
      )}
    </div>
  );
}
