let tokenGetter = async () => null;

export function setTokenGetter(fn) {
  tokenGetter = fn;
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Random per tab; lets this app ignore live-change events it caused itself. */
export const CLIENT_ID = `web-${newId()}`;

/** Headers for an authenticated request (also used by the live-sync stream). */
export async function authHeaders(forceRefresh = false) {
  const headers = { 'X-Client-Id': CLIENT_ID };
  const token = await tokenGetter(forceRefresh);
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function send(method, url, body, forceRefresh) {
  const headers = await authHeaders(forceRefresh);
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
}

export async function api(method, url, body) {
  let res;
  try {
    res = await send(method, url, body, false);
    // A token can expire between checks; refresh once and retry.
    if (res.status === 401) res = await send(method, url, body, true);
  } catch {
    throw new ApiError(0, 'You appear to be offline');
  }
  if (res.status === 204) return null;
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
  return data;
}

/** UUID that also works on plain-HTTP origins where crypto.randomUUID is missing. */
export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
