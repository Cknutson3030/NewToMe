//npx expo start uses .env.development
// with EAS build, it uses .env.production
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "https://newtomesask-bjc6bseke7a4edaz.canadacentral-01.azurewebsites.net";

console.log("API_BASE_URL =", API_BASE_URL);

// ---- Token store (set by AuthContext, read by API helpers) ----
let _accessToken: string | null = null;

export function setApiAccessToken(token: string | null) {
  _accessToken = token;
}

/** Build standard headers, adding Authorization when a token is available. */
function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (_accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`;
  }
  return headers;
}

export async function getListings(params?: Record<string, any>) {
  const url = new URL(`${API_BASE_URL}/listings`);
  if (params) {
    Object.keys(params).forEach((key) => {
      const v = params[key];
      if (v !== undefined && v !== null && v !== '') url.searchParams.append(key, String(v));
    });
  }

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Failed to fetch listings: ${res.status}`);
  const json = await res.json();
  return json;
}

export async function getMyListings(params?: Record<string, any>) {
  const url = new URL(`${API_BASE_URL}/listings/mine`);
  if (params) {
    Object.keys(params).forEach((key) => {
      const v = params[key];
      if (v !== undefined && v !== null && v !== '') url.searchParams.append(key, String(v));
    });
  }

  const headers = authHeaders();
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`Failed to fetch your listings: ${res.status}`);
  const json = await res.json();
  return json;
}

export async function createListing(body: Record<string, any>) {
  const headers = authHeaders({ 'Content-Type': 'application/json' });
  const res = await fetch(`${API_BASE_URL}/listings`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to create listing: ${res.status}`);
  }
  return res.json();
}

export async function updateListing(id: string, body: Record<string, any>) {
  const headers = authHeaders({ 'Content-Type': 'application/json' });
  const res = await fetch(`${API_BASE_URL}/listings/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to update listing: ${res.status}`);
  }
  return res.json();
}

export async function deleteListing(id: string) {
  const headers = authHeaders();
  const res = await fetch(`${API_BASE_URL}/listings/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to delete listing: ${res.status}`);
  }
}

export async function uploadListingImages(listingId: string, formData: FormData) {
  const headers = authHeaders({ 'Accept': 'application/json' });
  const res = await fetch(`${API_BASE_URL}/listings/${listingId}/images`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to upload images: ${res.status} - ${text}`);
  }
  return res.json();
}

export async function analyzeImageForListing(imageUri: string, mimeType: string): Promise<{
  product_name: string;
  description: string;
  category: string;
  item_condition: string;
  ghg: {
    manufacturing_kg: number;
    materials_kg: number;
    transport_kg: number;
    end_of_life_kg: number;
  };
}> {
  const formData = new FormData();
  formData.append('image', {
    uri: imageUri,
    name: 'photo.jpg',
    type: mimeType || 'image/jpeg',
  } as unknown as Blob);

  const headers = authHeaders({ Accept: 'application/json' });
  const res = await fetch(`${API_BASE_URL}/ai/analyze-image`, {
    method: 'POST',
    headers,
    body: formData,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `AI analysis failed: ${res.status}`);
  return json.data;
}

export async function deleteListingImage(listingId: string, imageId: string) {
  const headers = authHeaders();
  const res = await fetch(`${API_BASE_URL}/listings/${listingId}/images/${imageId}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to delete image: ${res.status}`);
  }
}