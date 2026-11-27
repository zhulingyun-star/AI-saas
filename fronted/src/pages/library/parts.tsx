import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Play } from 'lucide-react';
import { fileUrl } from '../../api';
import { useWorkspace } from '../../components/UI';
import { MODE_LABEL, shortTime } from '../projects/data';
import { fix, hookLabel, pct, personaLabel, reviewState, videoName, type VideoItem } from './data';

const pillTone = (tone: string) => (tone === 'ok' ? 'ok' : tone === 'wait' ? 'warn' : 'idle');

/** 复制成片的标准命名（投到千川时粘贴，导入时就能对上）；没命名的写「未规范化」 */
export function CopyName({ name, size = 'xs' }: { name?: string | null; size?: 'xs' | 'md' }) {
  const { notify } = useWorkspace();
  if (!name) return <span className="gy-unnamed">未规范化</span>;
  return (
    <button
      type="button"
      className={`gy-btn ghost ${size === 'xs' ? 'xs' : ''} gy-copyname`}
      aria-label={`复制命名 ${name}`}
      title="复制命名"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void navigator.clipboard
          ?.writeText(name)
          .then(() => notify('命名已复制'))
          .catch(() => notify('浏览器不让复制，可以手动选中复制'));
      }}
    >
      <Copy size={12} aria-hidden="true" />
      复制命名
    </button>
  );
}

/** 成片卡片：商品图做封面（成片在详情里播放），审片状态、该换新了、来源和投放数据；下面一行是标准命名和「复制命名」 */
export function VideoCard({ v, sort, extra }: { v: VideoItem; sort?: string; extra?: ReactNode }) {
  const { client } = useWorkspace();
  const [state, tone] = reviewState(v);
  const metric = (k: 'ctr' | 'cvr' | 'roi', name: string) => {
    const x = v.perf?.[k];
    return (
      <span className={sort === k ? 'on' : ''}>
        <small>{name}</small>
        <b>{k === 'roi' ? fix(x) : pct(x)}</b>
      </span>
    );
  };
  return (
    <div className="gy-vcard gy-card wrap">
      <Link className="lk" to={`/library/${v.id}`} aria-label={`成片：${videoName(v)}`}>
        <span className={`pv${v.ratio === '16:9' ? ' land' : ''}`}>
          {v.product?.coverId ? <img src={fileUrl(client.id, v.product.coverId)} alt="" /> : null}
          <span className={`gy-pill ${pillTone(tone)} st`}>{state}</span>
          {v.tired.length > 0 && <span className="tired">该换新了</span>}
          <span className="play" aria-hidden="true">
            <Play size={14} />
          </span>
          <span className="d">{v.duration} 秒</span>
        </span>
        <span className="bd">
          <b>{videoName(v)}</b>
          <small>
            {v.product?.name ?? '商品不在了'} · {shortTime(v.createdAt)}
          </small>
          <span className="tg">
            <span>{MODE_LABEL[v.mode] ?? '其他'}</span>
            <span>{hookLabel(v)}</span>
            <span>{personaLabel(v)}</span>
          </span>
          {v.perf ? (
            <span className="met">
              {metric('ctr', '点击率')}
              {metric('cvr', '转化率')}
              {metric('roi', '投产比')}
            </span>
          ) : (
            <span className="met none">还没填投放数据</span>
          )}
          {extra}
        </span>
      </Link>
      <span className="sn">
        {v.standardName ? <code title={v.standardName}>{v.standardName}</code> : null}
        <CopyName name={v.standardName} />
      </span>
    </div>
  );
}
