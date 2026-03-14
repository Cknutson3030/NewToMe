import { API_BASE_URL } from './listings';

let _accessToken: string | null = null;

export function setChatAccessToken(token: string | null) {
  _accessToken = token;
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`;
  return headers;
}

export async function getOrCreateConversation(listingId: string): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/conversations`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ listing_id: listingId }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Failed to open conversation: ${res.status}`);
  return json.data;
}

export async function listConversations(): Promise<any[]> {
  const res = await fetch(`${API_BASE_URL}/conversations`, {
    headers: authHeaders(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Failed to load conversations: ${res.status}`);
  return json.data ?? [];
}

export async function getMessages(conversationId: string, params?: { limit?: number; offset?: number }): Promise<any[]> {
  const url = new URL(`${API_BASE_URL}/conversations/${conversationId}/messages`);
  if (params?.limit !== undefined) url.searchParams.set('limit', String(params.limit));
  if (params?.offset !== undefined) url.searchParams.set('offset', String(params.offset));
  const res = await fetch(url.toString(), { headers: authHeaders() });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Failed to load messages: ${res.status}`);
  return json.data ?? [];
}

export async function sendMessage(conversationId: string, body: string): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ body }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Failed to send message: ${res.status}`);
  return json.data;
}
