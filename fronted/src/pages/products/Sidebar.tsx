import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  FileText,
  Folder as FolderIcon,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
  Inbox,
} from 'lucide-react';
import { post, put, request } from '../../api';
import { useWorkspace } from '../../components/UI';
import { folderScope, needsReview, useLibrary, useRefreshLibrary, type Folder } from './data';

/** 商品库左栏：文件夹（最多两层）、未分类、待核对。 */
export default function ProductSidebar() {
  const { client, notify } = useWorkspace();
  const { folders, products } = useLibrary();
  const refresh = useRefreshLibrary();
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const onList = pathname === '/products' || pathname === '/products/';
  const current = onList ? (params.get('folder') ?? 'all') : '';
  const [renaming, setRenaming] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ parentId: string | null } | null>(null);
  const top = folders.filter((f) => !f.parentId);
  const count = (id: string) => {
    const scope = folderScope(folders, id);
    return products.filter((p) => p.folderId && scope.has(p.folderId)).length;
  };
  const unfiled = products.filter((p) => !p.folderId).length;
  const pending = products.filter(needsReview).length;
  const go = (folder: string) =>
    navigate(folder === 'all' ? '/products' : `/products?folder=${encodeURIComponent(folder)}`);

  const finishRename = async (f: Folder, value: string | null) => {
    setRenaming(null);
    const name = value?.trim();
    if (!name || name === f.name) return;
    try {
      await put(`/clients/${client.id}/product-folders/${f.id}`, { name, revision: f.revision });
      await refresh();
      notify(`文件夹已改名为「${name}」`);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const finishCreate = async (value: string | null) => {
    const parentId = creating?.parentId ?? null;
    setCreating(null);
    const name = value?.trim();
    if (!name) return;
    try {
      const f = await post<Folder>(`/clients/${client.id}/product-folders`, { name, parentId });
      await refresh();
      notify(`已新建文件夹「${name}」`);
      go(f.id);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const remove = async (f: Folder) => {
    try {
      await request(`/clients/${client.id}/product-folders/${f.id}`, { method: 'DELETE' });
      await refresh();
      notify(`已删除文件夹「${f.name}」`);
      if (current === f.id) go('all');
    } catch (e) {
      notify((e as Error).message);
    }
  };

  const inlineInput = (
    label: string,
    initial: string,
    done: (v: string | null) => void,
    sub = false,
  ) => (
    <div className={`gy-rnrow${sub ? ' sub' : ''}`}>
      <InlineName label={label} initial={initial} onDone={done} />
    </div>
  );
  const folderRow = (f: Folder, sub: boolean) => {
    if (renaming === f.id)
      return (
        <div key={f.id}>
          {inlineInput('文件夹名称', f.name, (v) => void finishRename(f, v), sub)}
        </div>
      );
    const n = count(f.id);
    const empty = n === 0 && !folders.some((x) => x.parentId === f.id);
    return (
      <div key={f.id}>
        <div className="gy-fwrap">
          <button
            type="button"
            className={`gy-snav-item${sub ? ' sub' : ''}`}
            aria-current={current === f.id ? 'true' : undefined}
            title={f.name}
            onClick={() => go(f.id)}
          >
            <FolderIcon size={16} aria-hidden="true" />
            <span className="lbl">{f.name}</span>
            <span className="n">{n}</span>
          </button>
          <span className="gy-ftools">
            <button
              type="button"
              aria-label={`重命名文件夹 ${f.name}`}
              title="重命名"
              onClick={() => setRenaming(f.id)}
            >
              <Pencil size={12} />
            </button>
            {!sub && (
              <button
                type="button"
                aria-label={`在 ${f.name} 里新建子文件夹`}
                title="新建子文件夹"
                onClick={() => setCreating({ parentId: f.id })}
              >
                <FolderPlus size={12} />
              </button>
            )}
            {empty && (
              <button
                type="button"
                aria-label={`删除文件夹 ${f.name}`}
                title="删除空文件夹"
                onClick={() => void remove(f)}
              >
                <Trash2 size={12} />
              </button>
            )}
          </span>
        </div>
        {creating?.parentId === f.id &&
          inlineInput('子文件夹名称', '', (v) => void finishCreate(v), true)}
      </div>
    );
  };

  return (
    <>
      <Link
        className="gy-side-new"
        to={
          current && current !== 'all' && current !== 'pending' && current !== 'unfiled'
            ? `/products/new?folder=${current}`
            : '/products/new'
        }
        title="新增商品"
      >
        <Plus size={16} aria-hidden="true" />
        <span className="lbl">新增商品</span>
      </Link>
      <nav className="gy-snav" aria-label="商品文件夹">
        <div className="g">文件夹</div>
        <button
          type="button"
          className="gy-snav-item"
          aria-current={current === 'all' ? 'true' : undefined}
          title="全部商品"
          onClick={() => go('all')}
        >
          <Box size={16} aria-hidden="true" />
          <span className="lbl">全部商品</span>
          <span className="n">{products.length}</span>
        </button>
        {top.map((f) => (
          <div key={f.id}>
            {folderRow(f, false)}
            {folders.filter((c) => c.parentId === f.id).map((c) => folderRow(c, true))}
          </div>
        ))}
        <button
          type="button"
          className="gy-snav-item"
          aria-current={current === 'unfiled' ? 'true' : undefined}
          title="未分类"
          onClick={() => go('unfiled')}
        >
          <FolderIcon size={16} aria-hidden="true" />
          <span className="lbl">未分类</span>
          <span className="n">{unfiled}</span>
        </button>
        {creating?.parentId === null ? (
          inlineInput('新文件夹名称', '', (v) => void finishCreate(v))
        ) : (
          <button
            type="button"
            className="gy-addfold"
            onClick={() => setCreating({ parentId: null })}
          >
            + 新建文件夹
          </button>
        )}
        <div className="g">待处理</div>
        <button
          type="button"
          className="gy-snav-item"
          aria-current={current === 'pending' ? 'true' : undefined}
          title="分析待核对"
          onClick={() => go('pending')}
        >
          {pending ? (
            <FileText size={16} aria-hidden="true" />
          ) : (
            <Inbox size={16} aria-hidden="true" />
          )}
          <span className="lbl">分析待核对</span>
          <span className="n">{pending}</span>
        </button>
      </nav>
      <div className="gy-side-foot">
        <b>{client.name}</b>
        {products.length} 个商品 · {folders.length} 个文件夹
      </div>
    </>
  );
}

function InlineName({
  label,
  initial,
  onDone,
}: {
  label: string;
  initial: string;
  onDone: (v: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const [done, setDone] = useState(false);
  const finish = (ok: boolean) => {
    if (done) return;
    setDone(true);
    onDone(ok ? value : null);
  };
  return (
    <input
      className="gy-rename sm"
      aria-label={label}
      autoFocus
      maxLength={30}
      value={value}
      placeholder="输入名称，回车保存"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      }}
      onBlur={() => finish(true)}
    />
  );
}
