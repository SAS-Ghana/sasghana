const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ??
  "https://nbuqipukkpbcxkofnaib.supabase.co";
const publishableKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  "sb_publishable_WIuZltSLSSWN63fat12CoA_FsOuf_6G";

export type DataRow = Record<string, string | number | boolean | null | undefined>;

async function request<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
      hint?: string;
    };
    throw new Error(body.message ?? body.hint ?? "Supabase request failed.");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function callFunction<T>(
  accessToken: string,
  functionName: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(()=>({})) as T & { error?: string; message?:string };
  if (!response.ok) throw new Error(result.error ?? result.message ?? `Secure operation failed (${response.status}).`);
  return result;
}

export function listRows(
  accessToken: string,
  table: string,
  select = "*",
  limit = 250,
) {
  return request<DataRow[]>(
    accessToken,
    `${table}?select=${encodeURIComponent(select)}&order=created_at.desc&limit=${limit}`,
  );
}

export function listNamedRows(
  accessToken: string,
  table: string,
  select: string,
  orderColumn = "name",
) {
  return request<DataRow[]>(
    accessToken,
    `${table}?select=${encodeURIComponent(select)}&order=${orderColumn}.asc&limit=500`,
  );
}

export function createRow(
  accessToken: string,
  table: string,
  row: DataRow,
) {
  return request<DataRow[]>(accessToken, table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
}

export function updateRow(
  accessToken: string,
  table: string,
  id: string,
  row: DataRow,
) {
  return request<DataRow[]>(accessToken, `${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
}

export function updateRowsWhere(
  accessToken:string,
  table:string,
  column:string,
  value:string,
  row:DataRow,
) {
  return request<DataRow[]>(accessToken,`${table}?${column}=eq.${encodeURIComponent(value)}`,{
    method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify(row),
  });
}

export function deleteRow(accessToken: string, table: string, id: string) {
  return request<void>(accessToken, `${table}?id=eq.${id}`, {
    method: "DELETE",
  });
}

export async function uploadStorageFile(
  accessToken: string,
  bucket: string,
  path: string,
  file: File,
) {
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": file.type,
      "x-upsert": "true",
    },
    body: file,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as {message?:string};
    throw new Error(body.message ?? "File upload failed.");
  }
  return path;
}

export async function createSignedStorageUrl(
  accessToken: string,
  bucket: string,
  path: string,
  expiresIn = 300,
) {
  const response = await fetch(`${supabaseUrl}/storage/v1/object/sign/${bucket}/${path}`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({expiresIn}),
  });
  const body = await response.json() as {signedURL?:string;message?:string};
  if (!response.ok || !body.signedURL) throw new Error(body.message ?? "Secure preview could not be created.");
  return `${supabaseUrl}/storage/v1${body.signedURL}`;
}
