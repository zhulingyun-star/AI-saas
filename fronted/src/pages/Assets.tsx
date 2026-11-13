import ResourceNav from '../components/ResourceNav';
import { Link, useSearchParams } from 'react-router-dom';
import ProductAnalysis from '../components/ProductAnalysis';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, Search, Download, Image, Play, AudioLines, Shirt, Plus, X } from 'lucide-react';
import {
  Header,
  Empty,
  Modal,
  Field,
  useData,
  useWorkspace,
  useAction,
  Loading,
  ErrorState,
} from '../components/UI';
import { request, post, put, fileUrl } from '../api';
import { kindLabel, type Asset } from '../types';
import { productGroups as buildProductGroups, assetLabel, type ProductGroup } from '../productGroups';

function uploadFileLabel(file: File, files: File[], index: number) {
  const typeOf = (item: File) => item.type.startsWith('image/')
    ? 'image'
    : item.type.startsWith('video/')
      ? 'video'
      : 'audio';
  const type = typeOf(file);
  const prefix = type === 'image' ? '图片' : type === 'video' ? '视频' : '音频';
  const number = files
    .slice(0, index + 1)
    .filter((item) => typeOf(item) === type)
    .length;
  return `${prefix}${number}`;
}

export default function Assets({ kind }: { kind?: string }) {
  const [params] = useSearchParams();
  const openedProduct = useRef('');
  const { client } = useWorkspace();
  const cache = useQueryClient();
  const data = useData<Asset[]>('assets');
  const action = useAction();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(kind ?? 'ALL');
  const [upload, setUpload] = useState(false);
  const [uploadKind, setUploadKind] = useState(kind ?? 'PRODUCT');
  const [uploadTarget, setUploadTarget] = useState<ProductGroup | null>(null);
  const [uploadGroupId, setUploadGroupId] = useState('');
  const [activeProduct, setActiveProduct] = useState<ProductGroup | null>(null);
  const [activeAssetId, setActiveAssetId] = useState('');
  const [productView, setProductView] = useState<'materials' | 'analysis'>('materials');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<(string | null)[]>([]);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const urls = uploadFiles.map((file) => URL.createObjectURL(file));
    setFilePreviews(urls);
    return () => urls.forEach((url) => url && URL.revokeObjectURL(url));
  }, [uploadFiles]);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [look, setLook] = useState<string[]>([]);
  const reload = () => cache.invalidateQueries({ queryKey: [client.id, 'assets'] });
  const list =
    data.data?.filter(
      (a) =>
        (filter === 'ALL' || a.kind === filter) &&
        `${a.name} ${a.metadata.productName ?? ''} ${a.sku} ${a.tags}`.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  const productGroups = buildProductGroups(data.data ?? []).filter((group) =>
    (filter === 'ALL' || filter === 'PRODUCT') && group.assets.some((a) => list.some((match) => match.id === a.id)),
  );
  const otherAssets = list.filter((asset) => asset.kind !== 'PRODUCT');
  const openUpload = (target: ProductGroup | null = null) => {
    setUploadKind(target ? 'PRODUCT' : kind ?? 'PRODUCT');
    setUploadTarget(target);
    setUploadGroupId(target?.groupId || crypto.randomUUID());
    setUpload(true);
  };
  const openProduct = (group: ProductGroup, asset = group.cover) => {
    setProductView('materials');
    setActiveProduct(group);
    setActiveAssetId(asset.id);
  };
  const activeAsset = activeProduct?.assets.find((a) => a.id === activeAssetId) ?? activeProduct?.assets[0];
  useEffect(() => {
    const id = params.get('product');
    const key = `${client.id}:${id}`;
    if (!id || openedProduct.current === key || !data.data) return;
    const group = buildProductGroups(data.data).find(g => g.assets.some(a => a.id === id));
    if (group) { openedProduct.current = key; openProduct(group); setProductView('analysis'); }
  }, [params, data.data, client.id]);
  const title =
    kind === 'MODEL'
      ? '模特库'
      : kind === 'GARMENT'
        ? '服装搭配'
        : kind === 'VOICE'
          ? '音色与口播'
          : '商品与素材';
  const renderAsset = (a: Asset) => (
    <article className="asset-card" key={a.id}>
      <button className="asset-media" onClick={() => setSelected(a)} aria-label={'查看 ' + a.name}>
        {a.mime.startsWith('image/') ? (
          <img loading="lazy" src={fileUrl(client.id, a.id)} alt={a.name} />
        ) : a.mime.startsWith('video/') ? (
          <><video preload="metadata" src={fileUrl(client.id, a.id)} /><Play className="media-symbol" /></>
        ) : <AudioLines size={42} />}
        <span className="pill">{kindLabel[a.kind]}</span>
      </button>
      <div className="asset-body">
        <button className="plain" onClick={() => setSelected(a)}><strong>{a.name}</strong></button>
        <small>{a.sku || '未关联 SKU'} · {(a.sizeBytes / 1024 / 1024).toFixed(2)} MB</small>
        <div className="tags">{a.tags.split(/[,，]/).filter(Boolean).map((tag) => <span key={tag}>{tag}</span>)}</div>
        {kind === 'GARMENT' && (
          <label className="checkbox-line">
            <input type="checkbox" checked={look.includes(a.id)} onChange={(e) => setLook(e.target.checked ? [...look, a.id] : look.filter((x) => x !== a.id))} />
            {String(a.metadata.slot ?? '待设置部位')}
          </label>
        )}
      </div>
    </article>
  );
  return (
    <>
      <ResourceNav />
      {params.get('campaign') && <Link className="button" to={`/projects/${params.get('campaign')}`}>返回项目，继续制作视频</Link>}
      <Header
        title={title}
        description={
          kind === 'MODEL'
            ? '保留人物参考与授权记录；人物生成能力等待供应商接入。'
            : kind === 'GARMENT'
              ? '管理各部位服装，保存搭配参考；搭配单不是生成的上身图。'
              : kind === 'VOICE'
                ? '上传并试听真人录音。声音克隆与自动配音等待供应商接入。'
              : '一个商品一组素材，集中管理商品图、实拍片段与使用证据。'
        }
      >
        <button className="primary" onClick={() => openUpload()}>
          <Upload size={16} />
          {kind ? `上传${kindLabel[kind]}` : '新建商品素材组'}
        </button>
      </Header>
      {action.error && <ErrorState error={new Error(action.error)} />}
      <div className="toolbar">
        <div className="search">
          <Search size={17} />
          <input
            aria-label="搜索素材"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索名称、SKU 或标签"
          />
        </div>
        {!kind && (
          <select aria-label="素材分类" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="ALL">全部素材</option>
            {Object.entries(kindLabel).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        )}
        <span className="muted">{productGroups.length > 0 ? `${productGroups.length} 个商品 · ` : ''}{list.length} 个文件</span>
      </div>
      {kind === 'GARMENT' && (
        <div className="hint row between">
          <span>选择不同部位服装，保存客户搭配参考（已选 {look.length} 件）</span>
          <button
            disabled={!look.length || action.busy}
            onClick={() =>
              action.run(async () => {
                const picked = data.data!.filter((a) => look.includes(a.id));
                const slots = picked.map((a) => String(a.metadata.slot ?? ''));
                if (slots.some((s) => !s)) throw new Error('请先为每件服装填写部位');
                if (
                  new Set(slots).size !== slots.length ||
                  (slots.includes('整身') && (slots.includes('上衣') || slots.includes('下装')))
                )
                  throw new Error('同部位只能选择一件，整身与上衣/下装互斥');
                await post(`/clients/${client.id}/presets`, {
                  name: picked
                    .map((a) => a.name)
                    .join(' + ')
                    .slice(0, 100),
                  kind: 'LOOK',
                  content: JSON.stringify(
                    picked.map((a) => ({ id: a.id, name: a.name, slot: a.metadata.slot })),
                  ),
                  enabled: true,
                });
                setLook([]);
              }, '搭配参考已保存')
            }
          >
            <Shirt size={16} />
            保存搭配
          </button>
        </div>
      )}
      {data.isPending ? (
        <Loading />
      ) : data.error ? (
        <ErrorState error={data.error} />
      ) : !list.length ? (
        <section className="panel">
          <Empty
            title="建立第一个商品素材组"
            description="填写商品名称，一次加入多张图片或视频，保存为一个商品素材组。SKU 可选。"
          >
            <button onClick={() => openUpload()}>新建商品素材组</button>
          </Empty>
        </section>
      ) : (
        <>
          {!!productGroups.length && <div className="asset-grid product-grid">
            {productGroups.map((group) => (
              <article className="asset-card product-card" key={group.key}>
                <button className="product-cover" onClick={() => openProduct(group)} aria-label={`查看商品 ${group.productName}`}>
                  {group.cover.mime.startsWith('image/') ? <img src={fileUrl(client.id, group.cover.id)} alt={group.productName} />
                    : group.cover.mime.startsWith('video/') ? <video preload="metadata" src={fileUrl(client.id, group.cover.id)} /> : <AudioLines size={42} />}
                  <span className="pill">{group.assets.length} 份素材</span>
                </button>
                <div className="product-miniatures">
                  {group.assets.slice(0, 4).map((asset) => <button key={asset.id} aria-label={`查看 ${group.productName} ${assetLabel(asset, group.assets)}`} onClick={() => openProduct(group, asset)}>
                    {asset.mime.startsWith('image/') ? <img src={fileUrl(client.id, asset.id)} alt={assetLabel(asset, group.assets)} /> : asset.mime.startsWith('video/') ? <Play size={18} /> : <AudioLines size={18} />}
                  </button>)}
                  {group.assets.length > 4 && <button onClick={() => openProduct(group)}>+{group.assets.length - 4}</button>}
                </div>
                <div className="asset-body">
                  <button className="plain" onClick={() => openProduct(group)}><strong>{group.productName}</strong></button>
                  <small>SKU：{group.sku || '未设置'}</small>
                  <button className="product-add" onClick={() => openUpload(group)}><Plus size={16} />添加素材</button>
                </div>
              </article>
            ))}
          </div>}
          {!!otherAssets.length && <div className="asset-grid">{otherAssets.map(renderAsset)}</div>}
        </>
      )}
      {activeProduct && activeAsset && (
        <Modal title="商品详情与素材" className="product-detail-modal" onClose={() => setActiveProduct(null)}>
          <div className="product-details-heading">
            <h3>{activeProduct.productName}</h3>
            <p>SKU：{activeProduct.sku || '未设置'} · {activeProduct.assets.length} 份素材</p>
          </div>
          <div className="product-material-gallery" hidden={productView !== 'materials'}>
          <div className="product-gallery-main">
            {activeAsset.mime.startsWith('image/') ? <img src={fileUrl(client.id, activeAsset.id)} alt={assetLabel(activeAsset, activeProduct.assets)} />
              : activeAsset.mime.startsWith('video/') ? <video key={activeAsset.id} controls src={fileUrl(client.id, activeAsset.id)} />
                : <audio key={activeAsset.id} controls src={fileUrl(client.id, activeAsset.id)} />}
          </div>
          <div className="product-gallery-strip">
            {activeProduct.assets.map((asset) => (
              <button key={asset.id} className={asset.id === activeAsset.id ? 'is-active' : ''} aria-pressed={asset.id === activeAsset.id} onClick={() => setActiveAssetId(asset.id)}>
                {asset.mime.startsWith('image/') ? <img src={fileUrl(client.id, asset.id)} alt="" /> : asset.mime.startsWith('video/') ? <Play size={24} /> : <AudioLines size={24} />}
                <span>{assetLabel(asset, activeProduct.assets)}{asset.id === activeProduct.cover.id && asset.mime.startsWith('image/') ? ' · 封面' : ''}</span>
              </button>
            ))}
          </div>
          </div>
          <div className="product-view-tabs" role="tablist" aria-label="商品详情视图">
            <button type="button" role="tab" aria-selected={productView === 'materials'} onClick={() => setProductView('materials')}>商品素材</button>
            <button type="button" role="tab" aria-selected={productView === 'analysis'} onClick={() => setProductView('analysis')}>广告分析</button>
          </div>
          <div className="product-material-info" hidden={productView !== 'materials'}>
          {activeAsset.mime.startsWith('image/') && <div className="product-cover-action">
            <button type="button" disabled={action.busy || activeAsset.id === activeProduct.cover.id} onClick={() => action.run(async () => {
              const members = await put<Asset[]>(`/clients/${client.id}/product-groups/${activeProduct.assets[0].id}/cover`, { assetId: activeAsset.id });
              setActiveProduct(buildProductGroups(members)[0]);
              await reload();
            }, '商品封面已更新')}>
              {activeAsset.id === activeProduct.cover.id ? '当前封面' : '设为商品封面'}
            </button>
          </div>}
          <form onSubmit={(event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            action.run(async () => {
              const members = await put<Asset[]>(`/clients/${client.id}/product-groups/${activeProduct.assets[0].id}`, {
                productName: String(values.get('productName') ?? ''), sku: String(values.get('sku') ?? ''),
              });
              setActiveProduct(buildProductGroups(members)[0]);
              await reload();
            }, '商品名称和 SKU 已保存到整组素材');
          }}>
            <div className="form-grid">
              <Field label="商品名称"><input name="productName" required maxLength={100} defaultValue={activeProduct.productName} /></Field>
              <Field label="SKU（选填）"><input name="sku" maxLength={100} defaultValue={activeProduct.sku} placeholder="未设置" /></Field>
            </div>
            {action.error && <ErrorState error={new Error(action.error)} />}
            <div className="row between">
              <button type="button" onClick={() => { openUpload(activeProduct); setActiveProduct(null); }}><Plus size={16} />添加到此商品</button>
              <button className="primary" disabled={action.busy}>{action.busy ? '正在保存…' : '保存商品信息'}</button>
            </div>
          </form>
          <a className="button product-download" href={fileUrl(client.id, activeAsset.id) + '?download=true'}><Download size={16} />下载{assetLabel(activeAsset, activeProduct.assets)}原文件</a>
          </div>
          <div className="product-analysis-view" hidden={productView !== 'analysis'}>
          <ProductAnalysis key={activeProduct.assets[0].id} clientId={client.id} anchorId={activeProduct.assets[0].id}
            onChanged={() => { void reload(); }} onImage={(id) => {
              if (activeProduct.assets.some(a => a.id === id)) setActiveAssetId(id);
            }} />
          </div>
        </Modal>
      )}
      {upload && (
        <Modal title={uploadKind === 'PRODUCT' ? (uploadTarget ? '添加商品素材' : '新建商品素材组') : '上传素材'} onClose={() => { setUpload(false); setUploadTarget(null); setUploadFiles([]); }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              if (!uploadFiles.length) return;
              action.run(async () => {
                let groupId = uploadGroupId;
                if (uploadTarget && uploadKind === 'PRODUCT') {
                  const members = await put<Asset[]>(`/clients/${client.id}/product-groups/${uploadTarget.assets[0].id}`, {
                    productName: String(form.get('productName') ?? ''), sku: String(form.get('sku') ?? ''),
                  });
                  groupId = String(members[0].metadata.productGroupId);
                  setUploadGroupId(groupId);
                }
                for (const file of uploadFiles) {
                  const body = new FormData();
                  body.set('file', file);
                  body.set('kind', uploadKind);
                  body.set('sku', String(form.get('sku')));
                  body.set('tags', String(form.get('tags')));
                  body.set('productName', String(form.get('productName') ?? ''));
                  if (uploadKind === 'PRODUCT') body.set('productGroupId', groupId);
                  await request(`/clients/${client.id}/assets`, { method: 'POST', body });
                }
                await reload();
                setUpload(false);
                setUploadFiles([]);
              }, uploadKind === 'PRODUCT' ? '商品素材组已更新' : '素材已上传到客户空间');
            }}
          >
            <Field label="文件（每个不超过 100MB）">
              <input
                ref={fileInput}
                type="file"
                name="file"
                multiple
                className="visually-hidden"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/ogg"
                onChange={(e) => {
                  const added = Array.from(e.currentTarget.files ?? []);
                  setUploadFiles((current) => [...current, ...added]);
                  e.currentTarget.value = '';
                }}
              />
              <div
                className={`upload-dropzone${draggingFiles ? ' is-dragging' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => fileInput.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInput.current?.click();
                  }
                }}
                onDragEnter={(e) => { e.preventDefault(); setDraggingFiles(true); }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDraggingFiles(true); }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDraggingFiles(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDraggingFiles(false);
                  const files = Array.from(e.dataTransfer.files).filter((file) => fileInput.current?.accept.split(',').some((type) => file.type === type));
                  if (files.length) setUploadFiles((current) => [...current, ...files]);
                }}
              >
                <Upload size={22} />
                <strong>{draggingFiles ? '松开鼠标添加文件' : '拖动文件到这里，或点击选择'}</strong>
                <span>支持多选图片、视频和音频</span>
              </div>
              {!!uploadFiles.length && (
                <ul className="upload-file-list">
                  {uploadFiles.map((file, index) => (
                    <li key={`${file.name}-${file.size}-${index}`}>
                      <button
                        type="button"
                        className="upload-file-thumb"
                        aria-label={`预览${uploadFileLabel(file, uploadFiles, index)}`}
                        onClick={() => setPreviewFile(file)}
                      >
                        {filePreviews[index] && file.type.startsWith('image/') ? (
                          <img src={filePreviews[index]!} alt={uploadFileLabel(file, uploadFiles, index)} />
                        ) : filePreviews[index] && file.type.startsWith('video/') ? (
                          <video
                            src={filePreviews[index]!}
                            muted
                            playsInline
                            preload="metadata"
                            onLoadedMetadata={(e) => {
                              const video = e.currentTarget;
                              video.currentTime = Math.min(0.1, video.duration / 2 || 0.1);
                            }}
                          />
                        ) : (
                          <AudioLines size={17} />
                        )}
                      </button>
                      <span className="upload-file-name">{uploadFileLabel(file, uploadFiles, index)}</span>
                      <small>{(file.size / 1024 / 1024).toFixed(1)} MB</small>
                      <button type="button" className="icon-button" aria-label={`移除 ${file.name}`} onClick={() => setUploadFiles((current) => current.filter((_, i) => i !== index))}><X size={15} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </Field>
            <Field label="分类">
              <select name="kind" value={uploadKind} onChange={(e) => setUploadKind(e.target.value)} disabled={!!uploadTarget}>
                {Object.entries(kindLabel).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            {uploadKind === 'PRODUCT' && <Field label="商品名称"><input name="productName" required defaultValue={uploadTarget?.productName ?? ''} maxLength={100} placeholder="例如：夏季轻薄防晒衣" /></Field>}
            <div className="form-grid">
              <Field label="商品 SKU">
                <input name="sku" defaultValue={uploadTarget?.sku ?? ''} maxLength={100} />
              </Field>
              <Field label="标签（逗号分隔）">
                <input name="tags" maxLength={500} />
              </Field>
            </div>
            <div className="hint">
              请仅上传你拥有使用权的素材。模特与声音授权信息可在上传后补充。
            </div>
            {action.error && <ErrorState error={new Error(action.error)} />}
            <button className="primary" disabled={action.busy || !uploadFiles.length}>
              {action.busy ? '正在上传…' : `上传 ${uploadFiles.length || ''} 份素材`}
            </button>
          </form>
        </Modal>
      )}
      {previewFile && (() => {
        const index = uploadFiles.indexOf(previewFile);
        const url = index >= 0 ? filePreviews[index] : null;
        if (!url || index < 0) return null;
        const label = uploadFileLabel(previewFile, uploadFiles, index);
        return (
          <Modal title={label} onClose={() => setPreviewFile(null)}>
            <div className="upload-preview-media">
              {previewFile.type.startsWith('image/') ? (
                <img src={url} alt={label} />
              ) : previewFile.type.startsWith('video/') ? (
                <video controls autoPlay src={url} />
              ) : (
                <audio controls autoPlay src={url} />
              )}
            </div>
          </Modal>
        );
      })()}
      {selected && (
        <Modal title="素材详情与引用信息" onClose={() => setSelected(null)}>
          <div className="detail-media">
            {selected.mime.startsWith('image/') ? (
              <img src={fileUrl(client.id, selected.id)} alt={selected.name} />
            ) : selected.mime.startsWith('video/') ? (
              <video controls src={fileUrl(client.id, selected.id)} />
            ) : (
              <audio controls src={fileUrl(client.id, selected.id)} />
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action.run(async () => {
                await put(`/clients/${client.id}/assets/${selected.id}`, selected);
                await reload();
                setSelected(null);
              }, '素材信息已保存');
            }}
          >
            <Field label="文件名称">
              <input
                required
                value={selected.name}
                onChange={(e) => setSelected({ ...selected, name: e.target.value })}
                maxLength={255}
              />
            </Field>
            <div className="form-grid">
              {selected.kind === 'PRODUCT' && <Field label="商品名称"><input value={String(selected.metadata.productName ?? '')} onChange={(e) => setSelected({ ...selected, metadata: { ...selected.metadata, productName: e.target.value } })} maxLength={100} /></Field>}
              <Field label="SKU">
                <input
                  value={selected.sku}
                  onChange={(e) => setSelected({ ...selected, sku: e.target.value })}
                  maxLength={100}
                />
              </Field>
              <Field label="标签">
                <input
                  value={selected.tags}
                  onChange={(e) => setSelected({ ...selected, tags: e.target.value })}
                  maxLength={500}
                />
              </Field>
            </div>
            {selected.kind === 'GARMENT' && (
              <Field label="服装部位">
                <select
                  value={String(selected.metadata.slot ?? '')}
                  onChange={(e) =>
                    setSelected({
                      ...selected,
                      metadata: { ...selected.metadata, slot: e.target.value },
                    })
                  }
                >
                  <option value="">请选择部位</option>
                  {['外套', '上衣', '下装', '整身', '鞋履', '配饰'].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="来源与授权说明">
              <textarea
                value={String(selected.metadata.authorization ?? '')}
                onChange={(e) =>
                  setSelected({
                    ...selected,
                    metadata: { ...selected.metadata, authorization: e.target.value },
                  })
                }
                maxLength={2000}
                placeholder="来源、授权主体、可使用范围与到期时间"
              />
            </Field>
            {action.error && <ErrorState error={new Error(action.error)} />}
            <div className="row between">
              <a className="button" href={fileUrl(client.id, selected.id) + '?download=true'}>
                <Download size={16} />
                下载原文件
              </a>
              <button className="primary" disabled={action.busy}>
                保存信息
              </button>
            </div>
          </form>
        </Modal>
      )}
      <div className="caption row">
        <Image size={14} />
        页面内示例图仅用于展示；业务素材仅来自当前客户的实际上传。
      </div>
    </>
  );
}
