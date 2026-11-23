import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { fileUrl } from '../../api';
import { Btn } from '../../gy/ui';

/** 全屏图片查看：左右键切换，Esc 关闭，可设为封面。 */
export default function ImageViewer({
  clientId,
  ids,
  index,
  coverId,
  onIndex,
  onClose,
  onSetCover,
  busy,
}: {
  clientId: string;
  ids: string[];
  index: number;
  coverId?: string;
  onIndex: (i: number) => void;
  onClose: () => void;
  onSetCover?: (id: string) => void;
  busy?: boolean;
}) {
  const id = ids[index];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      if (e.key === 'ArrowRight' && index < ids.length - 1) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, ids.length, onClose, onIndex]);
  if (!id) return null;
  return (
    <div
      className="gy-lightbox gy-new"
      role="dialog"
      aria-modal="true"
      aria-label={`图片${index + 1}`}
    >
      <div className="gy-lightbox-head">
        <b>图片{index + 1}</b>
        {id === coverId && <span className="gy-covertag">封面</span>}
        <span style={{ opacity: 0.7 }}>
          {index + 1} / {ids.length}
        </span>
        <button
          type="button"
          className="gy-icon-btn"
          style={{ marginLeft: 'auto' }}
          aria-label="关闭图片"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div
        className="gy-lightbox-stage"
        onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      >
        <button
          type="button"
          className="gy-icon-btn"
          aria-label="上一张"
          disabled={index === 0}
          onClick={() => onIndex(index - 1)}
        >
          <ChevronLeft size={22} />
        </button>
        <img src={fileUrl(clientId, id)} alt={`图片${index + 1}`} />
        <button
          type="button"
          className="gy-icon-btn"
          aria-label="下一张"
          disabled={index >= ids.length - 1}
          onClick={() => onIndex(index + 1)}
        >
          <ChevronRight size={22} />
        </button>
      </div>
      <div className="gy-lightbox-foot">
        {onSetCover && id !== coverId && (
          <Btn size="xs" busy={busy} onClick={() => onSetCover(id)}>
            设为封面
          </Btn>
        )}
      </div>
    </div>
  );
}
