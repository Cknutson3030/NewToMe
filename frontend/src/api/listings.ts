export const API_BASE_URL = (process.env.API_BASE_URL as string) || 'http://172.16.1.252:3000';

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
  // return full response so caller can access both `data` and `meta`
  return json;
}
//API functions