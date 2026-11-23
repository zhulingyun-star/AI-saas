import { useRef, useState } from 'react';
import { AlertCircle, Plus, Sparkles, Upload } from 'lucide-react';
import { fileUrl } from '../../api';
import { useWorkspace } from '../../components/UI';
import { Field } from '../../gy/ui';
import { folderPath, orderedFolders, type Folder } from '../../gy/folders';
import {
  ACCEPT,
  boardLabel,
  checkVideo,
  clock,
  coverAt,
  isRunning,
  thumbUrl,
  type RefItem,
} from './data';

/** 竖版封面：有拆解结果用截帧，没有就用视频首帧；拆解中 / 没拆 / 失败盖一层状态。 */
export function RefCover({ item }: { item: RefItem }) {
  const { client } = useWorkspace();
  const b = item.storyboard;
  const at = coverAt(b);
  const [label, tone] = boardLabel(b);
  return (
    <span className="gy-rpv">
      {at !== null ? (
        <img src={thumbUrl(client.id, item.assetId, at)} alt="" loading="lazy" />
      ) : (
        <video
          src={`${fileUrl(client.id, item.assetId)}#t=0.5`}
          preload="metadata"
          muted
          playsInline
        />
      )}
      {b.hasReport && b.duration ? <span className="d">{clock(b.duration)}</span> : null}
      {!b.hasReport && (
        <span className={`st${tone === 'bad' ? ' bad' : ''}`}>
          {isRunning(b.status) ? (
            <Sparkles size={18} aria-hidden="true" />
          ) : tone === 'bad' ? (
            <AlertCircle size={18} aria-hidden="true" />
          ) : null}
          {label}
        </span>
      )}
    </span>
  );
}

export interface UploadDraft {
  file: File | null;
  name: string;
  folderId: string;
}

/** 上传参考视频的表单（参考视频库的上传弹窗和选择弹窗里共用）。 */
export function UploadFields({
  draft,
  onChange,
  folders,
  analysisEnabled,
  disabled,
}: {
  draft: UploadDraft;
  onChange: (d: UploadDraft) => void;
  folders: Folder[];
  analysisEnabled: boolean;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [problem, setProblem] = useState('');
  const pick = (files: File[]) => {
    if (!files.length) return;
    if (files.length > 1) return setProblem('一次上传一条参考视频');
    const p = checkVideo(files[0]);
    setProblem(p);
    if (!p) onChange({ ...draft, file: files[0] });
  };
  return (
    <div className="gy-rform">
      <input
        ref={input}
        type="file"
        hidden
        accept={ACCEPT}
        aria-label="选择参考视频文件"
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = '';
          pick(files);
        }}
      />
      <button
        type="button"
        className={`gy-rdrop${dragging ? ' dragging' : ''}`}
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(Array.from(e.dataTransfer.files));
        }}
      >
        <span className="ic">
          {draft.file ? (
            <Upload size={18} aria-hidden="true" />
          ) : (
            <Plus size={20} aria-hidden="true" />
          )}
        </span>
        <span>
          <b>
            {draft.file ? draft.file.name : dragging ? '松开就能添加' : '拖入参考视频，或点击选择'}
          </b>
          <small>
            {draft.file
              ? `${(draft.file.size / 1024 / 1024).toFixed(1)} MB · 点击换一条`
              : 'MP4 / MOV / WebM，不超过 100MB，建议 60 秒以内'}
          </small>
        </span>
      </button>
      {problem && (
        <span className="gy-fine" role="alert" style={{ color: 'var(--gy-danger)' }}>
          {problem}
        </span>
      )}
      <div className="gy-f2">
        <Field label="名称" htmlFor="rf-name">
          <input
            id="rf-name"
            className="gy-input"
            maxLength={60}
            value={draft.name}
            disabled={disabled}
            placeholder="不填就用文件名，例如 防晒霜 · 美妆带货"
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
          />
        </Field>
        <Field label="放进文件夹" htmlFor="rf-fold">
          <select
            id="rf-fold"
            className="gy-select"
            value={draft.folderId}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, folderId: e.target.value })}
          >
            <option value="">未分类</option>
            {orderedFolders(folders).map((f) => (
              <option key={f.id} value={f.id}>
                {folderPath(folders, f.id)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="gy-rsync">
        {analysisEnabled
          ? '上传后自动拆解镜头、台词和结构。拆好的参考视频存在库里，以后新建项目可以直接复用，不用重复上传和拆解。参考视频只用来学结构和节奏，不会放进成片。'
          : '读片模型还没配置，这次先把视频存进库里，配置好以后在详情页点“开始拆解”。参考视频只用来学结构和节奏，不会放进成片。'}
      </div>
    </div>
  );
}
