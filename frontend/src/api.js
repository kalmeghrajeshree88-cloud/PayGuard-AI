const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

let token = localStorage.getItem('pg_token');

export function setToken(t) {
  token = t;
  if (t) localStorage.setItem('pg_token', t);
  else localStorage.removeItem('pg_token');
}
export const hasToken = () => Boolean(token);

async function req(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  health: () => req('/health'),
  login: (email, password) => req('/auth/login', { method: 'POST', body: { email, password } }),
  register: (name, email, password) => req('/auth/register', { method: 'POST', body: { name, email, password } }),
  me: () => req('/auth/me'),
  analyze: (body) => req('/payments/analyze', { method: 'POST', body }),
  verify: (body) => req('/payments/verify', { method: 'POST', body }),
  execute: (body) => req('/payments/execute', { method: 'POST', body }),
  capture: (body) => req('/payments/capture', { method: 'POST', body }),
  refund: (body) => req('/payments/refund', { method: 'POST', body }),
  cancel: (body) => req('/payments/cancel', { method: 'POST', body }),
  payments: () => req('/payments'),
  summary: () => req('/dashboard/summary'),
};
