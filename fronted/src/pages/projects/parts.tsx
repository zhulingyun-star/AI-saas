import type { ReactNode } from 'react';
import { fileUrl } from '../../api';
import { useWorkspace } from '../../components/UI';
import { RefCover } from '../references/parts';
import { clock, type RefItem } from '../references/data';
import { RATIOS, RESOLUTIONS, type Flow } from './data';

/** 已选商品卡：点击换商品 */
export function ProductButton({
  name,
  sku,
  coverId,
  lines,
  onClick,
  action = '换商品',
}: {
  name?: string;
  sku?: string;
  coverId?: string | null;
  lines: ReactNode[];
  onClick: () => void;
  action?: string;
}) {
  const { client } = useWorkspace();
  return (
    <button
      type="button"
      className={`gy-selprod${name ? '' : ' empty'}`}
      onClick={onClick}
      aria-label={name ? `商品：${name}，点击${action}` : '选一个商品'}
    >
      <span className="im">{coverId && <img src={fileUrl(client.id, coverId)} alt="" />}</span>
      <span style={{ minWidth: 0 }}>
        <b>{name ?? '还没选商品'}</b>
        {name && <small>{sku ? `SKU ${sku}` : 'SKU 未设置'}</small>}
        {lines.map((l, i) => (
          <small key={i}>{l}</small>
        ))}
      </span>
      <span className="gy-btn secondary xs">{name ? action : '选商品'}</span>
    </button>
  );
}

/** 已选参考视频卡 */
export function ReferenceRow({
  item,
  lines,
  action,
}: {
  item: RefItem;
  lines?: ReactNode[];
  action?: ReactNode;
}) {
  const b = item.storyboard;
  return (
    <div className="gy-refv">
      <RefCover item={item} />
      <span style={{ minWidth: 0 }}>
        <b>{item.name}</b>
        <small>
          {b.hasReport
            ? `${clock(b.duration)} · ${b.shotCount ?? 0} 个镜头 · ${b.lineCount ?? 0} 句台词 · 已拆解`
            : b.status === 'QUEUED' || b.status === 'RUNNING'
              ? '拆解中，拆完才能用来做视频二创'
              : '还没拆解，先去参考视频库拆解'}
        </small>
        {lines?.map((l, i) => (
          <small key={i}>{l}</small>
        ))}
      </span>
      {action && <span className="gy-row">{action}</span>}
    </div>
  );
}

/** 画幅 + 分辨率的分段按钮 */
export function RatioPicker({
  ratio,
  resolution,
  onChange,
  disabled,
}: {
  ratio: string;
  resolution: string;
  onChange: (next: { ratio: string; resolution: string }) => void;
  disabled?: boolean;
}) {
  return (
    <span className="gy-rrpick">
      <span className="gy-seg" role="group" aria-label="画幅">
        {RATIOS.map(([v, t]) => (
          <button
            key={v}
            type="button"
            aria-pressed={ratio === v}
            disabled={disabled}
            onClick={() => onChange({ ratio: v, resolution })}
          >
            {t}
          </button>
        ))}
      </span>
      <span className="gy-seg" role="group" aria-label="分辨率">
        {RESOLUTIONS.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={resolution === v}
            disabled={disabled}
            onClick={() => onChange({ ratio, resolution: v })}
          >
            {v}
          </button>
        ))}
      </span>
    </span>
  );
}

export type Step = 1 | 2 | 3 | 4;
export interface StepProps {
  flow: Flow;
  /** 用接口返回的新详情替换当前数据 */
  apply: (next: Flow) => void;
  reload: () => Promise<unknown>;
  go: (s: Step) => void;
}

/** 置顶操作条：所有确认 / 下一步 / 出片按钮都放这里（在步骤条下方，滚动时贴在顶部）。 */
export function TopBar({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="gy-pdtop gy-card" role="toolbar" aria-label="这一步的操作">
      <span className="msg">{children}</span>
      {actions && <span className="gy-row acts">{actions}</span>}
    </div>
  );
}
