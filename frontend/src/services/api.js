const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";

export function getToken() {
  return localStorage.getItem("token") || "";
}

export function authHeaders(extra = {}) {
  const token = getToken();
  return token ? { ...extra, Authorization: "Bearer " + token } : { ...extra };
}

function newIdemKey() {
  try {
    return crypto.randomUUID();
  } catch {
    return String(Date.now()) + "-" + Math.random().toString(16).slice(2);
  }
}

async function handle(res) {
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg =
      (data && (data.detail || data.message)) ||
      (typeof data === "string" ? data : null) ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: authHeaders(),
  });
  return handle(res);
}

export async function apiPost(path, body, opts = {}) {
  const headers = authHeaders({ "Content-Type": "application/json" });
  if (opts.idempotent !== false) headers["X-Idempotency-Key"] = newIdemKey();

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  return handle(res);
}

export async function apiPut(path, body, opts = {}) {
  const headers = authHeaders({ "Content-Type": "application/json" });
  if (opts.idempotent !== false) headers["X-Idempotency-Key"] = newIdemKey();

  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  return handle(res);
}

export async function apiDelete(path, opts = {}) {
  const headers = authHeaders();
  if (opts.idempotent !== false) headers["X-Idempotency-Key"] = newIdemKey();

  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers,
  });
  return handle(res);
}
