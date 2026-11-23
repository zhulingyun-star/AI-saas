import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Pencil, Play, Plus } from 'lucide-react';
import { put, request } from '../../api';
import { useWorkspace } from '../../components/UI';
import { Btn, Card, Dialog, EmptyState, Notice, PageHead, SearchBox } from '../../gy/ui';
import { folderPath, InlineName } from '../../gy/folders';
import {
  boardSummary,
  inFolder,
  uploadReference,
  usedText,
  useReferenceLibrary,
  useRefreshReferences,
  type RefItem,
} from './data';
import { RefCover, UploadFields, type UploadDraft } from './parts';

export default function ReferenceList() {
  const { client, notify } = useWorkspace();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { folders, refs, analysisEnabled, isPending, error } = useReferenceLibrary();
  const refresh = useRefreshReferences();
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const folder = params.get('folder') ?? 'all';
  const folderObj = folders.find((f) => f.id === folder);
  const inView = inFolder(refs, folders, folder);
  const q = query.trim().toLowerCase();
  const rows = inView.filter((r) => !q || `${r.name} ${r.fileName}`.toLowerCase().includes(q));
  const title = folderObj
    ? folderPath(folders, folderObj.id)
    : folder === 'unfiled'
      ? '未分类'
      : '全部参考视频';
  const uploading = params.get('upload') === '1';
  const openUpload = () =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.set('upload', '1');
      return next;
    });
  const closeUpload = () =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.delete('upload');
      return next;
    });

  const rename = async (r: RefItem, value: string | null) => {
    setRenaming(null);
    const name = value?.trim();
    if (!name || name === r.name) return;
    try {
      // 列表里没有 revision，先拿详情里的最新 revision 再改
      const detail = await fetchRevision(client.id, r.assetId);
      await put(`/clients/${client.id}/references/${r.assetId}/name`, { name, revision: detail });
      await refresh();
      notify(`已改名为「${name}」`);
    } catch (e) {
      notify((e as Error).message);
    }
  };

  return (
    <div className="gy-page gy-new">
      <PageHead
        title={title}
        description="上传一次、拆解一次，以后做视频二创可以反复用。参考视频只学结构和节奏，不放进成片。"
      >
        <Btn variant="primary" onClick={openUpload}>
          <Plus size={14} aria-hidden="true" />
          上传参考视频
        </Btn>
      </PageHead>
      <div className="gy-toolbar">
        <span className="gy-muted">
          {q ? `找到 ${rows.length} 条` : `${inView.length} 条`}
          {folderObj ? ` · 文件夹「${folderObj.name}」` : ''}
        </span>
        <SearchBox
          label="搜索参考视频"
          placeholder="搜索参考视频名称"
          value={query}
          onChange={setQuery}
        />
      </div>
      {error ? (
        <Notice tone="error" title="参考视频库没加载出来">
          {(error as Error).message}
        </Notice>
      ) : isPending ? (
        <Card pad>
          <span className="gy-muted">正在加载参考视频…</span>
        </Card>
      ) : !refs.length ? (
        <Card>
          <EmptyState title="还没有参考视频" icon={<Play size={22} />}>
            <span>上传一条想学的爆款视频，拆好镜头和台词，以后做视频二创直接拿来用。</span>
            <Btn variant="primary" onClick={openUpload}>
              <Plus size={14} aria-hidden="true" />
              上传参考视频
            </Btn>
          </EmptyState>
        </Card>
      ) : (
        <div className="gy-rgrid" role="list" aria-label="参考视频">
          {rows.map((r) => (
            <div className="gy-rcard" role="listitem" key={r.assetId}>
              <button
                type="button"
                className="gy-rcard-open"
                aria-label={`查看参考视频 ${r.name}`}
                onClick={() => navigate(`/references/${r.assetId}`)}
              >
                <RefCover item={r} />
                {renaming !== r.assetId && (
                  <span style={{ minWidth: 0 }}>
                    <b title={r.name}>{r.name}</b>
                    <small>
                      {boardSummary(r)} · {folderPath(folders, r.folderId)}
                    </small>
                    <small className={r.usedBy.length ? 'use' : ''}>{usedText(r)}</small>
                  </span>
                )}
              </button>
              {renaming === r.assetId ? (
                <InlineName
                  label="参考视频名称"
                  initial={r.name}
                  maxLength={60}
                  onDone={(v) => void rename(r, v)}
                />
              ) : (
                <button
                  type="button"
                  className="gy-rn"
                  aria-label={`重命名 ${r.name}`}
                  title="重命名"
                  onClick={() => setRenaming(r.assetId)}
                >
                  <Pencil size={14} />
                </button>
              )}
            </div>
          ))}
          {!q && (
            <button type="button" className="gy-rcard-up" onClick={openUpload}>
              <Plus size={20} aria-hidden="true" />
              <span>上传参考视频</span>
            </button>
          )}
          {!rows.length && (
            <span className="gy-muted" style={{ gridColumn: '1 / -1', padding: '12px 0' }}>
              {q ? `没有找到“${query.trim()}”` : '这个文件夹还没有参考视频'}
            </span>
          )}
        </div>
      )}
      {uploading && (
        <UploadDialog
          defaultFolder={folderObj?.id ?? ''}
          onClose={closeUpload}
          onDone={(id) => {
            closeUpload();
            void refresh();
            navigate(`/references/${id}`);
          }}
          analysisEnabled={analysisEnabled}
        />
      )}
    </div>
  );
}

async function fetchRevision(clientId: string, assetId: string) {
  const d = await request<{ labelRevision: number }>(`/clients/${clientId}/references/${assetId}`);
  return d.labelRevision;
}

/** 上传参考视频弹窗：上传后进详情页看拆解进度。 */
function UploadDialog({
  defaultFolder,
  onClose,
  onDone,
  analysisEnabled,
}: {
  defaultFolder: string;
  onClose: () => void;
  onDone: (assetId: string) => void;
  analysisEnabled: boolean;
}) {
  const { client, notify } = useWorkspace();
  const { folders } = useReferenceLibrary();
  const [draft, setDraft] = useState<UploadDraft>({
    file: null,
    name: '',
    folderId: defaultFolder,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // 直接打开带 ?upload=1 的地址时，文件夹列表可能晚一步才加载出来
  useEffect(() => {
    if (defaultFolder) setDraft((d) => (d.folderId ? d : { ...d, folderId: defaultFolder }));
  }, [defaultFolder]);
  const submit = async () => {
    if (!draft.file) return setErr('先选一条视频');
    setBusy(true);
    setErr('');
    try {
      const { asset, startError } = await uploadReference(client.id, draft.file, {
        name: draft.name,
        folderId: draft.folderId || null,
        analyze: analysisEnabled,
      });
      notify(
        startError
          ? `视频已存进参考视频库，但拆解没开始：${startError}`
          : analysisEnabled
            ? '已上传，正在拆解'
            : '已存进参考视频库',
      );
      onDone(asset.id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="上传参考视频"
      onClose={() => !busy && onClose()}
      width={620}
      footer={
        <>
          <span className="gy-muted" style={{ marginRight: 'auto' }}>
            会存进参考视频库
          </span>
          <Btn variant="ghost" disabled={busy} onClick={onClose}>
            取消
          </Btn>
          <Btn variant="primary" busy={busy} disabled={!draft.file} onClick={() => void submit()}>
            {analysisEnabled ? '上传并拆解' : '上传'}
          </Btn>
        </>
      }
    >
      <UploadFields
        draft={draft}
        onChange={setDraft}
        folders={folders}
        analysisEnabled={analysisEnabled}
        disabled={busy}
      />
      {err && <Notice tone="error">{err}</Notice>}
    </Dialog>
  );
}
