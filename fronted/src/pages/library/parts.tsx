import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { fileUrl } from '../../api';
import { useWorkspace } from '../../components/UI';
import { MODE_LABEL, shortTime } from '../projects/data';
import { fix, hookLabel, pct, personaLabel, reviewState, videoName, type VideoItem } from './data';

const pillTone = (tone: string) => (tone === 'ok' ? 'ok' : tone === 'wait' ? 'warn' : 'idle');

/** 成片卡片：商品图做封面（成片在详情里播放），审片状态、该换新了、来源和投放数据 */
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
    <Link className="gy-vcard gy-card" to={`/library/${v.id}`} aria-label={`成片：${videoName(v)}`}>
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
  );
}
