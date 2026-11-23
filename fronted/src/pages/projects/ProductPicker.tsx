import { useEffect, useRef, useState } from 'react';
import { Box, ChevronLeft, Plus } from 'lucide-react';
import { fileUrl, post, put, request } from '../../api';
import { useWorkspace } from '../../components/UI';
import type { Asset } from '../../types';
import { Btn, Field, Notice, SearchBox } from '../../gy/ui';
import { FolderGroup, folderPath, folderScope, orderedFolders } from '../../gy/folders';
import { analysisLabel, useLibrary, useRefreshLibrary, type ProductItem } from '../products/data';

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * 商品选择弹窗：左边商品库文件夹，右边搜索 + 小卡片，单选；
 * 也可以在弹窗里新建商品（上传一组图、起名、放进文件夹），保存后同步到商品库并开始分析。
 */
export default function ProductPicker({
  selected,
  onPick,
  onClose,
}: {
  selected?: string | null;
  onPick: (p: ProductItem) => void;
  onClose: () => void;
}) {
  const { client, notify } = useWorkspace();
  const { folders, products, isPending, error } = useLibrary();
  const refresh = useRefreshLibrary();
  const [mode, setMode] = useState<'pick' | 'new'>('pick');
  const [folder, setFolder] = useState('all');
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<string | null>(
    products.find((p) => p.group.assets.some((a) => a.id === selected))?.key ?? null,
  );
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy]);
  useEffect(() => {
    if (sel || !selected) return;
    const hit = products.find((p) => p.group.assets.some((a) => a.id === selected));
    if (hit) setSel(hit.key);
  }, [products, selected, sel]);

  const scoped =
    folder === 'all'
      ? products
      : folder === 'unfiled'
        ? products.filter((p) => !p.folderId)
        : products.filter((p) => !!p.folderId && folderScope(folders, folder).has(p.folderId));
  const q = query.trim().toLowerCase();
  const list = scoped.filter(
    (p) => !q || `${p.group.productName} ${p.group.sku}`.toLowerCase().includes(q),
  );
  const chosen = products.find((p) => p.key === sel);

  const save = async () => {
    if (!name.trim()) return setErr('先填商品名称');
    if (!files.length) return setErr('至少上传一张商品图');
    setBusy(true);
    setErr('');
    try {
      const groupId = crypto.randomUUID();
      const created: Asset[] = [];
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
      }
      const first = created[0].id;
      if (newFolder)
        await put(`/clients/${client.id}/product-groups/${first}/folder`, { folderId: newFolder });
      let analysisNote = '';
      try {
        await post(`/clients/${client.id}/product-groups/${first}/analysis`, { brief: '' });
      } catch (e) {
        analysisNote = `，但分析没开始：${(e as Error).message}`;
      }
      await refresh();
      const all = await request<Asset[]>(`/clients/${client.id}/assets`);
      const group = all.filter(
        (a) => a.kind === 'PRODUCT' && String(a.metadata.productGroupId ?? '') === groupId,
      );
      notify(`商品「${name.trim()}」已存进商品库并选中${analysisNote}`);
      onPick({
        key: `group:${groupId}`,
        anchorId: first,
        folderId: newFolder || null,
        images: group.filter((a) => a.mime.startsWith('image/')),
        group: {
          key: `group:${groupId}`,
          groupId,
          productName: name.trim(),
          sku: sku.trim(),
          assets: group.length ? group : created,
          cover: (group.length ? group : created)[0],
        },
      });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="gy-overlay gy-new"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section className="gy-pk" role="dialog" aria-modal="true" aria-label="选择商品">
        <div className="gy-pk-head">
          {mode === 'pick' ? (
            <>
              <h3>选择商品</h3>
              <span className="gy-muted">一个项目只能选一个</span>
              <SearchBox
                label="在弹窗里搜索商品"
                placeholder="搜索商品名或 SKU"
                value={query}
                onChange={setQuery}
              />
            </>
          ) : (
            <>
              <button
                type="button"
                className="gy-backlink"
                disabled={busy}
                onClick={() => setMode('pick')}
              >
                <ChevronLeft size={14} aria-hidden="true" />
                返回选择
              </button>
              <h3>新建商品</h3>
            </>
          )}
        </div>
        <div className="gy-pk-body">
          <nav className="gy-snav gy-pk-tree" aria-label="选择弹窗里的商品文件夹">
            <FolderGroup
              folders={folders}
              current={folder}
              onSelect={(f) => {
                setFolder(f);
                if (mode === 'new') setNewFolder(f === 'all' || f === 'unfiled' ? '' : f);
              }}
              all={{
                label: '全部商品',
                icon: <Box size={15} aria-hidden="true" />,
                count: products.length,
              }}
              count={(id) =>
                products.filter((p) => !!p.folderId && folderScope(folders, id).has(p.folderId))
                  .length
              }
              unfiled={products.filter((p) => !p.folderId).length}
            />
          </nav>
          {mode === 'pick' ? (
            <div className="gy-pk-grid gy-pk-goods" role="radiogroup" aria-label="商品">
              {error ? (
                <div className="gy-pk-empty">
                  <Notice tone="error">{(error as Error).message}</Notice>
                </div>
              ) : isPending ? (
                <div className="gy-pk-empty">正在加载…</div>
              ) : (
                list.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className="gy-pkc"
                    role="radio"
                    aria-checked={sel === p.key}
                    aria-label={p.group.productName}
                    onClick={() => setSel(p.key)}
                    onDoubleClick={() => onPick(p)}
                  >
                    <span className="rd" aria-hidden="true" />
                    <span className="gy-pkim">
                      {p.group.cover.mime.startsWith('image/') && (
                        <img src={fileUrl(client.id, p.group.cover.id)} alt="" loading="lazy" />
                      )}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <b title={p.group.productName}>{p.group.productName}</b>
                      <small>
                        {p.group.sku ? `SKU ${p.group.sku}` : 'SKU 未设置'} ·{' '}
                        {folderPath(folders, p.folderId)}
                      </small>
                      <small>{analysisLabel(p)[0]}</small>
                    </span>
                  </button>
                ))
              )}
              {!isPending && !error && !list.length && (
                <div className="gy-pk-empty">
                  {q ? `没有找到“${query.trim()}”` : '这个文件夹还没有商品'}
                </div>
              )}
              {!isPending && !error && (
                <button
                  type="button"
                  className="gy-pkc new"
                  onClick={() => {
                    setErr('');
                    setNewFolder(folders.some((f) => f.id === folder) ? folder : '');
                    setMode('new');
                  }}
                >
                  <Plus size={18} aria-hidden="true" />
                  新建商品
                  <small>会同步到商品库</small>
                </button>
              )}
            </div>
          ) : (
            <div className="gy-pk-form">
              <div className="gy-rform">
                <div className="gy-f2">
                  <Field label="商品名称" required htmlFor="pk-name">
                    <input
                      id="pk-name"
                      className="gy-input"
                      maxLength={100}
                      value={name}
                      disabled={busy}
                      placeholder="例如 新百伦鞋子"
                      onChange={(e) => setName(e.target.value)}
                    />
                  </Field>
                  <Field label="SKU" htmlFor="pk-sku">
                    <input
                      id="pk-sku"
                      className="gy-input"
                      maxLength={100}
                      value={sku}
                      disabled={busy}
                      placeholder="可后补"
                      onChange={(e) => setSku(e.target.value)}
                    />
                  </Field>
                </div>
                <Field label="放进文件夹" htmlFor="pk-fold">
                  <select
                    id="pk-fold"
                    className="gy-select"
                    value={newFolder}
                    disabled={busy}
                    onChange={(e) => setNewFolder(e.target.value)}
                  >
                    <option value="">未分类</option>
                    {orderedFolders(folders).map((f) => (
                      <option key={f.id} value={f.id}>
                        {folderPath(folders, f.id)}
                      </option>
                    ))}
                  </select>
                </Field>
                <input
                  ref={input}
                  type="file"
                  hidden
                  multiple
                  accept={ACCEPT.join(',')}
                  aria-label="选择商品图"
                  onChange={(e) => {
                    const list = Array.from(e.currentTarget.files ?? []);
                    e.currentTarget.value = '';
                    const ok = list.filter((f) => ACCEPT.includes(f.type));
                    setErr(ok.length < list.length ? '只能添加 JPG、PNG、WebP 图片' : '');
                    setFiles((cur) => [...cur, ...ok].slice(0, 30));
                  }}
                />
                <button
                  type="button"
                  className="gy-rdrop"
                  disabled={busy}
                  onClick={() => input.current?.click()}
                >
                  <span className="ic">
                    <Plus size={20} aria-hidden="true" />
                  </span>
                  <span>
                    <b>{files.length ? `已选 ${files.length} 张图片` : '点击选择商品图'}</b>
                    <small>
                      {files.length
                        ? files.map((f) => f.name).join('、')
                        : '建议 3–10 张：正面、侧面、细节、吊牌或包装文字'}
                    </small>
                  </span>
                </button>
                <div className="gy-rsync">
                  保存后商品会出现在商品库对应的文件夹里，并在后台开始分析。分析完成后，在新建项目里带入商品事实。
                </div>
              </div>
              {err && (
                <div style={{ marginTop: 12 }}>
                  <Notice tone="error">{err}</Notice>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="gy-pk-foot">
          <span className="gy-muted">
            {mode === 'pick' ? `已选：${chosen?.group.productName ?? '无'}` : '会同步到商品库'}
          </span>
          <Btn variant="ghost" disabled={busy} onClick={onClose}>
            取消
          </Btn>
          {mode === 'pick' ? (
            <Btn variant="primary" disabled={!chosen} onClick={() => chosen && onPick(chosen)}>
              选这个商品
            </Btn>
          ) : (
            <Btn variant="primary" busy={busy} onClick={() => void save()}>
              保存并选用
            </Btn>
          )}
        </div>
      </section>
    </div>
  );
}
