// Transaction API helpers for frontend
import { API_BASE_URL } from './listings';

function authHeaders(token?: string) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Buyer requests to purchase a listing
export async function requestTransaction(listingId: string, token: string) {
  const res = await fetch(`${API_BASE_URL}/transactions/request`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify({ listingId }),
  });
  if (!res.ok) throw new Error('Failed to request transaction');
  return res.json();
}

// Seller responds to a transaction (approve/reject)
export async function respondTransaction(transactionId: string, action: 'approved' | 'rejected', token: string) {
  const res = await fetch(`${API_BASE_URL}/transactions/respond`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
    },
    body: JSON.stringify({ transactionId, action }),
  });
  if (!res.ok) throw new Error('Failed to respond to transaction');
  return res.json();
}
