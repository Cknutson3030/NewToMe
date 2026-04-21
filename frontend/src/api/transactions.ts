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
export async function requestTransaction(
  listingId: string,
  offeredPrice: number,
  notes?: string,
  ghgDiscount?: number
) {
  const res = await fetch(`${API_BASE_URL}/transactions/request`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ listingId, offeredPrice, notes, ghgDiscount: ghgDiscount ?? 0 }),
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

// Buyer or seller confirms transaction completion
export async function confirmTransaction(transactionId: string) {
  const res = await fetch(`${API_BASE_URL}/transactions/${transactionId}/confirm`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Failed to confirm transaction: ${res.status}`);
  return json;
}

// Get GHG history for current user
export async function getGhgHistory(params?: { limit?: number; offset?: number }) {
  const url = new URL(`${API_BASE_URL}/transactions/ghg-history`);
  if (params?.limit !== undefined) url.searchParams.set('limit', String(params.limit));
  if (params?.offset !== undefined) url.searchParams.set('offset', String(params.offset));
  const res = await fetch(url.toString(), { headers: authHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Failed to fetch GHG history: ${res.status}`);
  return json.data ?? [];
}

// List current user's transactions (role: 'seller'|'buyer'|'all', optional status)
export async function listMyTransactions(params?: { role?: string; status?: string; limit?: number; offset?: number }) {
  const url = new URL(`${API_BASE_URL}/transactions/mine`);
  if (params) {
    if (params.role) url.searchParams.set('role', params.role);
    if (params.status) url.searchParams.set('status', params.status);
    if (params.limit !== undefined) url.searchParams.set('limit', String(params.limit));
    if (params.offset !== undefined) url.searchParams.set('offset', String(params.offset));
  }
  const res = await fetch(url.toString(), { headers: authHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Failed to list transactions: ${res.status}`);
  return json.data ?? [];
}
