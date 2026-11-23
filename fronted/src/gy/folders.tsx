import { useState, type ReactNode } from 'react';
import { Folder as FolderIcon, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import { post, put, request } from '../api';
import { useWorkspace } from '../components/UI';

/**
 * 库文件夹（商品库、参考视频库共用）：最多两层，一条东西只在一个文件夹里，
 * 「全部…」和「未分类」是固定项，不能改名。后端规则见 LibraryFolders.java。
 */
export interface Folder {
  id: string;
  parentId?: string | null;
  name: string;
  sortOrder: number;
  revision: number;
}

/** 文件夹本身和它的子文件夹 */
export function folderScope(folders: Folder[], id: string) {
  return new Set([id, ...folders.filter((f) => f.parentId === id).map((f) => f.id)]);
}
export function folderPath(folders: Folder[], id: string | null | undefined) {
  const f = folders.find((x) => x.id === id);
  if (!f) return '未分类';
  const parent = folders.find((x) => x.id === f.parentId);
  return parent ? `${parent.name} / ${f.name}` : f.name;
}
/** 按「父文件夹、它的子文件夹」的顺序排好，方便放进下拉框 */
export function orderedFolders(folders: Folder[]) {
  return folders
    .filter((f) => !f.parentId)
    .flatMap((f) => [f, ...folders.filter((c) => c.parentId === f.id)]);
}

/** 行内改名输入框：回车保存、Esc 取消、失焦保存。 */
export function InlineName({
  label,
  initial,
  onDone,
  maxLength = 30,
  className = 'gy-rename sm',
  placeholder = '输入名称，回车保存',
}: {
  label: string;
  initial: string;
  onDone: (v: string | null) => void;
  maxLength?: number;
  className?: string;
  placeholder?: string;
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
      className={className}
      aria-label={label}
      autoFocus
      maxLength={maxLength}
      value={value}
      placeholder={placeholder}
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

/**
 * 左栏的「文件夹」一组：全部、各文件夹（悬停出现改名 / 新建子文件夹 / 删除空文件夹）、未分类、新建文件夹。
 * endpoint 是文件夹接口，例如 /clients/{id}/product-folders；不传 endpoint 就是只读（选择弹窗里用）。
 */
export function FolderGroup({
  folders,
  current,
  onSelect,
  all,
  count,
  unfiled,
  endpoint,
  onChanged,
}: {
  folders: Folder[];
  current: string;
  onSelect: (key: string) => void;
  all: { label: string; icon: ReactNode; count: number };
  count: (folderId: string) => number;
  unfiled: number;
  endpoint?: string;
  onChanged?: () => Promise<unknown>;
}) {
  const { notify } = useWorkspace();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ parentId: string | null } | null>(null);
  const top = folders.filter((f) => !f.parentId);
  const editable = !!endpoint;

  const finishRename = async (f: Folder, value: string | null) => {
    setRenaming(null);
    const name = value?.trim();
    if (!name || name === f.name) return;
    try {
      await put(`${endpoint}/${f.id}`, { name, revision: f.revision });
      await onChanged?.();
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
      const f = await post<Folder>(endpoint!, { name, parentId });
      await onChanged?.();
      notify(`已新建文件夹「${name}」`);
      onSelect(f.id);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const remove = async (f: Folder) => {
    try {
      await request(`${endpoint}/${f.id}`, { method: 'DELETE' });
      await onChanged?.();
      notify(`已删除文件夹「${f.name}」`);
      if (current === f.id) onSelect('all');
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
    const empty = count(f.id) === 0 && !folders.some((x) => x.parentId === f.id);
    return (
      <div key={f.id}>
        <div className="gy-fwrap">
          <button
            type="button"
            className={`gy-snav-item${sub ? ' sub' : ''}`}
            aria-current={current === f.id ? 'true' : undefined}
            title={f.name}
            onClick={() => onSelect(f.id)}
          >
            <FolderIcon size={16} aria-hidden="true" />
            <span className="lbl">{f.name}</span>
            <span className="n">{count(f.id)}</span>
          </button>
          {editable && (
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
          )}
        </div>
        {creating?.parentId === f.id &&
          inlineInput('子文件夹名称', '', (v) => void finishCreate(v), true)}
      </div>
    );
  };

  return (
    <>
      <div className="g">文件夹</div>
      <button
        type="button"
        className="gy-snav-item"
        aria-current={current === 'all' ? 'true' : undefined}
        title={all.label}
        onClick={() => onSelect('all')}
      >
        {all.icon}
        <span className="lbl">{all.label}</span>
        <span className="n">{all.count}</span>
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
        onClick={() => onSelect('unfiled')}
      >
        <FolderIcon size={16} aria-hidden="true" />
        <span className="lbl">未分类</span>
        <span className="n">{unfiled}</span>
      </button>
      {editable &&
        (creating?.parentId === null ? (
          inlineInput('新文件夹名称', '', (v) => void finishCreate(v))
        ) : (
          <button
            type="button"
            className="gy-addfold"
            onClick={() => setCreating({ parentId: null })}
          >
            + 新建文件夹
          </button>
        ))}
    </>
  );
}
