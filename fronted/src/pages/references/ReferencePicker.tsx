import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Play, Plus } from 'lucide-react';
import { request } from '../../api';
import { useWorkspace } from '../../components/UI';
import { Btn, Notice, SearchBox } from '../../gy/ui';
import { FolderGroup, folderPath } from '../../gy/folders';
import {
  boardSummary,
  clock,
  inFolder,
  uploadReference,
  useReferenceLibrary,
  useRefreshReferences,
  type RefDetail,
  type RefItem,
} from './data';
import { RefCover, UploadFields, type UploadDraft } from './parts';

/**
 * 参考视频选择弹窗（可复用）：左边文件夹，右边搜索 + 小卡片，单选；
 * 也可以在弹窗里上传新的参考视频，上传后同步进参考视频库并直接选中。
 */
export default function ReferencePicker({
  selectedId,
  onPick,
  onClose,
  title = '选择参考视频',
}: {
  selectedId?: string | null;
  onPick: (item: RefItem) => void;
  onClose: () => void;
  title?: string;
}) {
  const { client, notify } = useWorkspace();
  const { folders, refs, analysisEnabled, isPending, error } = useReferenceLibrary();
  const refresh = useRefreshReferences();
  const [mode, setMode] = useState<'pick' | 'upload'>('pick');
  const [folder, setFolder] = useState('all');
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState<string | null>(selectedId ?? null);
  const [draft, setDraft] = useState<UploadDraft>({ file: null, name: '', folderId: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy]);

  const q = query.trim().toLowerCase();
  const list = inFolder(refs, folders, folder).filter(
    (r) => !q || `${r.name} ${r.fileName}`.toLowerCase().includes(q),
  );
  const chosen = refs.find((r) => r.assetId === sel);
  const toUpload = () => {
    setErr('');
    setDraft({
      file: null,
      name: '',
      folderId: folders.some((f) => f.id === folder) ? folder : '',
    });
    setMode('upload');
  };
  const upload = async () => {
    if (!draft.file) return setErr('先选一条视频');
    setBusy(true);
    setErr('');
    try {
      const { asset, startError } = await uploadReference(client.id, draft.file, {
        name: draft.name,
        folderId: draft.folderId || null,
        analyze: analysisEnabled,
      });
      await refresh();
      const item = await request<RefDetail>(`/clients/${client.id}/references/${asset.id}`);
      notify(
        startError
          ? `已存进参考视频库并选中，但拆解没开始：${startError}`
          : '已上传并选中，参考视频库里也能看到',
      );
      onPick(item);
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
      <section className="gy-pk" role="dialog" aria-modal="true" aria-label={title}>
        <div className="gy-pk-head">
          {mode === 'pick' ? (
            <>
              <h3>{title}</h3>
              <span className="gy-muted">一个项目只用一条</span>
              <SearchBox
                label="在弹窗里搜索参考视频"
                placeholder="搜索参考视频名称"
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
              <h3>上传参考视频</h3>
            </>
          )}
        </div>
        <div className="gy-pk-body">
          <nav className="gy-snav gy-pk-tree" aria-label="选择弹窗里的文件夹">
            <FolderGroup
              folders={folders}
              current={folder}
              onSelect={(f) => {
                setFolder(f);
                if (mode === 'upload')
                  setDraft({ ...draft, folderId: f === 'all' || f === 'unfiled' ? '' : f });
              }}
              all={{
                label: '全部参考视频',
                icon: <Play size={15} aria-hidden="true" />,
                count: refs.length,
              }}
              count={(id) => inFolder(refs, folders, id).length}
              unfiled={refs.filter((r) => !r.folderId).length}
            />
          </nav>
          {mode === 'pick' ? (
            <div className="gy-pk-grid" role="radiogroup" aria-label="参考视频">
              {error ? (
                <div className="gy-pk-empty">
                  <Notice tone="error">{(error as Error).message}</Notice>
                </div>
              ) : isPending ? (
                <div className="gy-pk-empty">正在加载…</div>
              ) : (
                list.map((r) => (
                  <button
                    key={r.assetId}
                    type="button"
                    className="gy-pkc"
                    role="radio"
                    aria-checked={sel === r.assetId}
                    aria-label={r.name}
                    onClick={() => setSel(r.assetId)}
                    onDoubleClick={() => onPick(r)}
                  >
                    <span className="rd" aria-hidden="true" />
                    <RefCover item={r} />
                    <span style={{ minWidth: 0 }}>
                      <b title={r.name}>{r.name}</b>
                      <small>
                        {r.storyboard.hasReport
                          ? `${clock(r.storyboard.duration)} · ${r.storyboard.shotCount ?? 0} 个镜头`
                          : boardSummary(r)}{' '}
                        · {folderPath(folders, r.folderId)}
                      </small>
                    </span>
                  </button>
                ))
              )}
              {!isPending && !error && !list.length && (
                <div className="gy-pk-empty">
                  {q ? `没有找到“${query.trim()}”` : '这个文件夹还没有参考视频'}
                </div>
              )}
              {!isPending && !error && (
                <button type="button" className="gy-pkc new" onClick={toUpload}>
                  <Plus size={18} aria-hidden="true" />
                  上传参考视频
                  <small>会同步到参考视频库</small>
                </button>
              )}
            </div>
          ) : (
            <div className="gy-pk-form">
              <UploadFields
                draft={draft}
                onChange={setDraft}
                folders={folders}
                analysisEnabled={analysisEnabled}
                disabled={busy}
              />
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
            {mode === 'pick' ? `已选：${chosen?.name ?? '无'}` : '会同步到参考视频库'}
          </span>
          <Btn variant="ghost" disabled={busy} onClick={onClose}>
            取消
          </Btn>
          {mode === 'pick' ? (
            <Btn variant="primary" disabled={!chosen} onClick={() => chosen && onPick(chosen)}>
              用这条
            </Btn>
          ) : (
            <Btn variant="primary" busy={busy} disabled={!draft.file} onClick={() => void upload()}>
              上传并选用
            </Btn>
          )}
        </div>
      </section>
    </div>
  );
}
