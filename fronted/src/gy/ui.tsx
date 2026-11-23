import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { X, AlertCircle, CheckCircle2, Info, Search, Sparkles } from 'lucide-react';

/** 光影云基础组件：按钮、卡片、标签、输入框、弹窗、抽屉、提示条等。样式见 gy.css。 */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'md' | 'xs';
  wide?: boolean;
  busy?: boolean;
  danger?: boolean;
};
export function Btn({
  variant = 'secondary',
  size = 'md',
  wide,
  busy,
  danger,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: BtnProps) {
  const cls = [
    'gy-btn',
    variant,
    size === 'xs' ? 'xs' : '',
    wide ? 'wide' : '',
    danger ? 'danger' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={cls} disabled={disabled || busy} {...rest}>
      {busy && <span className="gy-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Card({
  children,
  pad,
  editing,
  className = '',
  ...rest
}: {
  children: ReactNode;
  pad?: boolean;
  editing?: boolean;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={['gy-card', pad ? 'pad' : '', editing ? 'editing' : '', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="gy-card-head">
      <h3>{title}</h3>
      {children && <div className="gy-card-tools">{children}</div>}
    </div>
  );
}

export function PageHead({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="gy-ph">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="gy-row">{children}</div>}
    </div>
  );
}

export function Chip({
  pressed,
  count,
  children,
  ...rest
}: {
  pressed?: boolean;
  count?: number;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className="gy-chip" aria-pressed={!!pressed} {...rest}>
      {children}
      {count !== undefined && <span className="n">{count}</span>}
    </button>
  );
}

export function Field({
  label,
  required,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="gy-field">
      <label className="gy-label" htmlFor={htmlFor}>
        {label}
        {required && <em aria-hidden="true">*</em>}
      </label>
      {children}
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <label className="gy-search">
      <Search size={14} aria-hidden="true" />
      <input
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function Notice({
  tone = 'info',
  title,
  children,
  actions,
}: {
  tone?: 'info' | 'warn' | 'error' | 'success';
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const Icon =
    tone === 'error' || tone === 'warn' ? AlertCircle : tone === 'success' ? CheckCircle2 : Info;
  return (
    <div className={`gy-notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={16} aria-hidden="true" />
      <div className="gy-notice-body">
        {title && <b>{title}</b>}
        {children && <span>{children}</span>}
      </div>
      {actions && <div className="gy-notice-actions">{actions}</div>}
    </div>
  );
}

function useEscape(onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ref.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function Dialog({
  title,
  onClose,
  children,
  footer,
  wide,
  width,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** 自定义宽度（像素），窄屏时不超过屏幕 */
  width?: number;
}) {
  useEscape(onClose);
  return (
    <div
      className="gy-overlay gy-new"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={`gy-dialog${wide ? ' wide' : ''}`}
        style={width ? { width: `min(${width}px, 100%)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="gy-dialog-head">
          <h3>{title}</h3>
          <button type="button" className="gy-icon-btn" aria-label="关闭" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        {children}
        {footer && <div className="gy-dialog-foot">{footer}</div>}
      </section>
    </div>
  );
}

export function Drawer({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEscape(onClose);
  return (
    <div className="gy-new">
      <div className="gy-drawer-bg" onMouseDown={onClose} />
      <aside className="gy-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="gy-drawer-head">
          <b>{title}</b>
          <button type="button" className="gy-icon-btn" aria-label="关闭" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="gy-drawer-body">{children}</div>
        {footer && <div className="gy-drawer-foot">{footer}</div>}
      </aside>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  children,
}: {
  tabs: readonly T[];
  value: T;
  onChange: (t: T) => void;
  label: string;
  children?: ReactNode;
}) {
  return (
    <div className="gy-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={t === value}
          onClick={() => onChange(t)}
        >
          {t}
        </button>
      ))}
      {children && <span className="gy-tabs-tools">{children}</span>}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  icon,
}: {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="gy-empty">
      <span className="ic">{icon ?? <Sparkles size={22} />}</span>
      <b>{title}</b>
      {children}
    </div>
  );
}

export function Spinner() {
  return <span className="gy-spin" aria-hidden="true" />;
}
