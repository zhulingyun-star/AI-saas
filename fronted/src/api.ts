let csrf: { token: string; headerName: string } | null = null;
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method ?? 'GET';
  if (!['GET', 'HEAD'].includes(method) && !csrf) csrf = await request('/auth/csrf');
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set('Content-Type', 'application/json');
  if (csrf && !['GET', 'HEAD'].includes(method)) headers.set(csrf.headerName, csrf.token);
  const res = await fetch('/api' + path, { ...options, headers, credentials: 'same-origin' });
  if (!res.ok) {
    let message = '请求失败，请稍后重试';
    try {
      message = (await res.json()).message ?? message;
    } catch {
      /* preserve generic message */
    }
    if (res.status === 401) {
      csrf = null;
      window.dispatchEvent(new Event('unauthorized'));
    }
    if (res.status === 403) csrf = null;
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
export function resetCsrf() {
  csrf = null;
}
export const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const put = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
export const fileUrl = (client: string, id: string) => `/api/clients/${client}/assets/${id}/file`;
export const jobUrl = (client: string, id: string, type = 'mp4', download = false) =>
  `/api/clients/${client}/jobs/${id}/file?type=${type}&download=${download}`;
