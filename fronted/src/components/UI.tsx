import { createContext, useContext, useState, type ReactNode } from 'react';
import { AlertCircle, FolderOpen, X, LoaderCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { request } from '../api';
import type { Client } from '../types';
export const Workspace = createContext<{
  client: Client;
  username: string;
  notify: (text: string) => void;
}>(null!);
export const useWorkspace = () => useContext(Workspace);
export function useData<T>(resource: string, refresh = false) {
  const { client } = useWorkspace();
  return useQuery<T>({
    queryKey: [client.id, resource],
    queryFn: () => request(`/clients/${client.id}/${resource}`),
    refetchInterval: refresh ? 4000 : false,
  });
}
export function Header({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="actions">{children}</div>
    </div>
  );
}
export function Empty({
  title = '这里还没有内容',
  description = '完成第一步，内容会出现在这里。',
  children,
}: {
  title?: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <FolderOpen size={32} />
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={20} /> 正在加载工作空间
    </div>
  );
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="error-box">
      <AlertCircle size={18} />
      <span>{error instanceof Error ? error.message : '加载失败'}</span>
      {retry && <button onClick={retry}>重新加载</button>}
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
  className = '',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function SubmitButton({
  busy,
  children,
  ...props
}: { busy?: boolean; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className="primary" disabled={busy} {...props}>
      {busy && <LoaderCircle className="spin" size={16} />} {children}
    </button>
  );
}
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { notify } = useWorkspace();
  return {
    busy,
    error,
    run: async (fn: () => Promise<void>, message?: string) => {
      setBusy(true);
      setError('');
      try {
        await fn();
        if (message) notify(message);
      } catch (e) {
        setError(e instanceof Error ? e.message : '操作失败');
      } finally {
        setBusy(false);
      }
    },
  };
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
