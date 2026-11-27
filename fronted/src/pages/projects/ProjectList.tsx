import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FolderInput, LayoutDashboard, Pencil, Plus } from 'lucide-react';
import { fileUrl, put } from '../../api';
import { useWorkspace } from '../../components/UI';
import { Btn, Card, Dialog, EmptyState, Field, Notice, PageHead, SearchBox } from '../../gy/ui';
import { folderPath, InlineName, orderedFolders } from '../../gy/folders';
import {
  formatRR,
  inFolder,
  MODE_LABEL,
  progressLabel,
  projectPath,
  shortTime,
  useProjectLibrary,
  useRefreshProjects,
  type ProjectItem,
} from './data';

/** 项目列表：按文件夹看、搜索、改名、移动。点项目进详情（新版建的都进四步详情，旧流程的作品进旧制作页）。 */
export default function ProjectList() {
  const { client, notify } = useWorkspace();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { folders, projects, isPending, error } = useProjectLibrary();
  const refresh = useRefreshProjects();
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [moving, setMoving] = useState<ProjectItem | null>(null);
  const [moveTo, setMoveTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const folder = params.get('folder') ?? 'all';
  const folderObj = folders.find((f) => f.id === folder);
  const inView = inFolder(projects, folders, folderObj ? folderObj.id : folder);
  const q = query.trim().toLowerCase();
  const rows = inView.filter(
    (p) =>
      !q ||
      `${p.name} ${p.product?.name ?? ''} ${p.reference?.name ?? ''} ${MODE_LABEL[p.mode]}`
        .toLowerCase()
        .includes(q),
  );
  const title = folderObj
    ? folderPath(folders, folderObj.id)
    : folder === 'unfiled'
      ? '未分类'
      : '全部项目';
  const newLink = folderObj ? `/p/new?folder=${folderObj.id}` : '/p/new';
  const open = (p: ProjectItem) => navigate(projectPath(p));

  const rename = async (p: ProjectItem, value: string | null) => {
    setRenaming(null);
    const name = value?.trim();
    if (!name || name === p.name) return;
    try {
      await put(`/clients/${client.id}/projects/${p.id}/name`, { name, revision: p.revision });
      await refresh();
      notify(`已改名为「${name}」`);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const move = async () => {
    if (!moving) return;
    setBusy(true);
    setErr('');
    try {
      await put(`/clients/${client.id}/projects/${moving.id}/folder`, { folderId: moveTo || null });
      await refresh();
      notify(`已移到「${folderPath(folders, moveTo || null)}」`);
      setMoving(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gy-page gy-new">
      <PageHead
        title={title}
        description={
          <>
            {folderObj ? `文件夹 · ${inView.length} 个项目` : ''}
          </>
        }
      >
        <Btn variant="primary" onClick={() => navigate(newLink)}>
          <Plus size={14} aria-hidden="true" />
          新建项目
        </Btn>
      </PageHead>
      <div className="gy-toolbar">
        <span className="gy-muted">{q ? `找到 ${rows.length} 个` : `${inView.length} 个项目`}</span>
        <SearchBox
          label="搜索项目"
          placeholder="搜索项目名、商品或参考视频"
          value={query}
          onChange={setQuery}
        />
      </div>
      {error ? (
        <Notice tone="error" title="项目没加载出来">
          {(error as Error).message}
        </Notice>
      ) : isPending ? (
        <Card pad>
          <span className="gy-muted">正在加载项目…</span>
        </Card>
      ) : !projects.length ? (
        <Card>
          <EmptyState title="还没有项目" icon={<LayoutDashboard size={22} />}>
            <Btn variant="primary" onClick={() => navigate(newLink)}>
              <Plus size={14} aria-hidden="true" />
              新建项目
            </Btn>
          </EmptyState>
        </Card>
      ) : (
        <Card className="gy-table-wrap">
          <table className="gy-goods gy-pjlist">
            <thead>
              <tr>
                <th>项目</th>
                <th>文件夹</th>
                <th>商品</th>
                <th>创作方式</th>
                <th>画面</th>
                <th>进度</th>
                <th>更新</th>
                <th aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const [label, tone] = progressLabel(p);
                return (
                  <tr
                    key={p.id}
                    tabIndex={0}
                    aria-label={`打开项目 ${p.name}`}
                    onClick={() => renaming !== p.id && open(p)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.target === e.currentTarget) open(p);
                    }}
                  >
                    <td>
                      {renaming === p.id ? (
                        <span onClick={(e) => e.stopPropagation()}>
                          <InlineName
                            label="项目名称"
                            initial={p.name}
                            maxLength={150}
                            onDone={(v) => void rename(p, v)}
                          />
                        </span>
                      ) : (
                        <span className="gy-gname">
                          <b>{p.name}</b>
                          <small>
                            {p.mode === 'REMAKE' && p.reference
                              ? `参考视频 · ${p.reference.name}`
                              : p.flow
                                ? ''
                                : '在旧的制作页里打开'}
                          </small>
                        </span>
                      )}
                    </td>
                    <td className="gy-muted" data-label="文件夹">
                      {folderPath(folders, p.folderId)}
                    </td>
                    <td data-label="商品">
                      {p.product ? (
                        <span className="gy-person">
                          <span className="gy-thumb">
                            {p.product.coverId && (
                              <img
                                src={fileUrl(client.id, p.product.coverId)}
                                alt=""
                                loading="lazy"
                              />
                            )}
                          </span>
                          {p.product.name}
                        </span>
                      ) : (
                        <span className="gy-muted">—</span>
                      )}
                    </td>
                    <td data-label="创作方式">{MODE_LABEL[p.mode]}</td>
                    <td className="gy-muted" data-label="画面">
                      {formatRR(p)}
                    </td>
                    <td data-label="进度">
                      <span className={`gy-dot ${tone}`}>{label}</span>
                    </td>
                    <td className="gy-muted" data-label="更新">
                      {shortTime(p.updatedAt)}
                    </td>
                    <td className="gy-pjops" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="gy-icon-btn"
                        aria-label={`重命名项目 ${p.name}`}
                        title="重命名"
                        onClick={() => setRenaming(p.id)}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        className="gy-icon-btn"
                        aria-label={`移动项目 ${p.name}`}
                        title="移动到文件夹"
                        onClick={() => {
                          setMoveTo(p.folderId ?? '');
                          setErr('');
                          setMoving(p);
                        }}
                      >
                        <FolderInput size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={8} className="gy-muted" style={{ textAlign: 'center', padding: 40 }}>
                    {q ? `没有找到“${query.trim()}”` : '这个文件夹还没有项目'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
      {moving && (
        <Dialog
          title="移动到文件夹"
          onClose={() => !busy && setMoving(null)}
          footer={
            <>
              <Btn variant="ghost" disabled={busy} onClick={() => setMoving(null)}>
                取消
              </Btn>
              <Btn variant="primary" busy={busy} onClick={() => void move()}>
                移动
              </Btn>
            </>
          }
        >
          <Field label={`把「${moving.name}」放进`} htmlFor="pj-move">
            <select
              id="pj-move"
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
          {err && <Notice tone="error">{err}</Notice>}
        </Dialog>
      )}
    </div>
  );
}
