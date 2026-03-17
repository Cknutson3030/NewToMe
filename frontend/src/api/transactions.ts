// Transaction API helpers for frontend
import { API_BASE_URL } from './listings';

let _accessToken: string | null = null;

export function setTransactionsAccessToken(token: string | null) {
  _accessToken = token;
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`;
  return headers;
}

// Buyer requests to purchase a listing
export async function requestTransaction(listingId: string) {
  const res = await fetch(`${API_BASE_URL}/transactions/request`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ listingId }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Failed to request transaction: ${res.status}`);
  return json.data ?? json;
}

// Seller responds to a transaction (approve/reject)
export async function respondTransaction(transactionId: string, action: 'approved' | 'rejected') {
  const res = await fetch(`${API_BASE_URL}/transactions/respond`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ transactionId, action }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Failed to respond to transaction: ${res.status}`);
  return json.data ?? json;
}

// List current user's transactions (role: 'seller'|'buyer'|'all', optional status)
export async function listMyTransactions(params?: { role?: string; status?: string }) {
  const url = new URL(`${API_BASE_URL}/transactions/mine`);
  if (params) {
    if (params.role) url.searchParams.set('role', params.role);
    if (params.status) url.searchParams.set('status', params.status);
  }
  const res = await fetch(url.toString(), { headers: authHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Failed to list transactions: ${res.status}`);
  return json.data ?? [];
}
