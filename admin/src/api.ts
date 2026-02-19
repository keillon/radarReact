const API_BASE_URL =
  import.meta.env.VITE_API_URL ??
  (typeof window !== "undefined" ? "" : "http://localhost:3000");

async function handleResponse<T>(res: Response, errorMsg: string): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let details = "";
    try {
      const json = JSON.parse(text);
      details = json.error || json.message || text.slice(0, 200);
    } catch {
      details = text.slice(0, 200);
    }
    throw new Error(`${errorMsg}: ${res.status}${details ? ` — ${details}` : ""}`);
  }
  return text ? JSON.parse(text) : ({} as T);
}

export interface Radar {
  id: string;
  latitude: number;
  longitude: number;
  speedLimit?: number;
  type?: string;
  situacao?: string | null;
  source?: string | null;
  rodovia?: string | null;
  municipio?: string | null;
  uf?: string | null;
  createdAt?: string;
}

interface ApiRadarResponse {
  id: string;
  latitude: number;
  longitude: number;
  velocidadeLeve?: number | null;
  tipoRadar?: string;
  situacao?: string | null;
  source?: string | null;
  rodovia?: string | null;
  municipio?: string | null;
  uf?: string | null;
  createdAt?: string;
  [key: string]: unknown;
}

const mapApi = (r: ApiRadarResponse): Radar => ({
  id: r.id,
  latitude: r.latitude,
  longitude: r.longitude,
  speedLimit: r.velocidadeLeve ?? undefined,
  type: r.tipoRadar ?? "unknown",
  situacao: r.situacao ?? undefined,
  source: r.source ?? undefined,
  rodovia: r.rodovia ?? undefined,
  municipio: r.municipio ?? undefined,
  uf: r.uf ?? undefined,
  createdAt: r.createdAt ?? undefined,
});

/** Normaliza payload do WebSocket (radar:new) para o formato Radar do admin (evita duplicata e fallback placa60). */
export function normalizeRadarPayload(data: unknown): Radar | null {
  if (!data || typeof (data as any).id !== "string") return null;
  const d = data as Record<string, unknown>;
  return {
    id: String(d.id),
    latitude: Number(d.latitude ?? d.lat ?? 0),
    longitude: Number(d.longitude ?? d.lng ?? 0),
    speedLimit: d.velocidadeLeve != null ? Number(d.velocidadeLeve) : undefined,
    type: (d.tipoRadar as string) ?? (d.type as string) ?? "unknown",
    situacao: (d.situacao as string) ?? undefined,
    source: (d.source as string) ?? undefined,
    rodovia: (d.rodovia as string) ?? undefined,
    municipio: (d.municipio as string) ?? undefined,
    uf: (d.uf as string) ?? undefined,
    createdAt: (d.createdAt as string) ?? undefined,
  };
}

export async function getRadarsNearLocation(
  lat: number,
  lon: number,
  radius = 50000
): Promise<Radar[]> {
  const res = await fetch(
    `${API_BASE_URL}/radars?lat=${lat}&lon=${lon}&radius=${radius}`
  );
  const data = await handleResponse<{ radars?: ApiRadarResponse[] }>(
    res,
    `Erro ao carregar radares`
  );
  return (data.radars || []).map(mapApi);
}

export async function reportRadar(params: {
  latitude: number;
  longitude: number;
  speedLimit?: number;
  type?: string;
}): Promise<Radar> {
  const res = await fetch(`${API_BASE_URL}/radars/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      latitude: params.latitude,
      longitude: params.longitude,
      velocidadeLeve: params.speedLimit ?? null,
      tipoRadar: params.type ?? "reportado",
      reportedBy: "admin",
    }),
  });
  const data = await handleResponse<{ radar?: ApiRadarResponse } & ApiRadarResponse>(
    res,
    "Erro ao criar radar"
  );
  return mapApi(data.radar || data);
}

export async function updateRadar(
  id: string,
  payload: {
    latitude?: number;
    longitude?: number;
    speedLimit?: number;
    situacao?: string;
  }
): Promise<Radar | null> {
  const body: Record<string, unknown> = {};
  if (payload.latitude != null) body.latitude = payload.latitude;
  if (payload.longitude != null) body.longitude = payload.longitude;
  if (payload.speedLimit != null) body.velocidadeLeve = payload.speedLimit;
  if (payload.situacao != null) body.situacao = payload.situacao;

  const res = await fetch(`${API_BASE_URL}/radars/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    let details = "";
    try {
      const json = JSON.parse(text);
      details = json.error || json.message || text.slice(0, 150);
    } catch {
      details = text.slice(0, 150);
    }
    throw new Error(`Erro ao atualizar: ${res.status}${details ? ` — ${details}` : ""}`);
  }
  const data = await res.json();
  return mapApi(data.radar || data);
}

export async function deleteRadar(id: string): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/radars/${id}`, { method: "DELETE" });
  if (res.status === 404) return false;
  if (!res.ok) {
    const text = await res.text();
    let details = "";
    try {
      const json = JSON.parse(text);
      details = json.error || json.message || text.slice(0, 150);
    } catch {
      details = text.slice(0, 150);
    }
    throw new Error(`Erro ao deletar: ${res.status}${details ? ` — ${details}` : ""}`);
  }
  return true;
}

/** Config do admin (token Mapbox em runtime; usado quando não está no build) */
export async function getAdminConfig(): Promise<{ mapboxToken: string }> {
  const base = import.meta.env.VITE_API_URL ?? (typeof window !== "undefined" ? "" : "http://localhost:3000");
  const res = await fetch(`${base}/admin/config`, { credentials: "same-origin" });
  const data = await res.json();
  return { mapboxToken: data.mapboxToken ?? "" };
}

/** Status do import CSV (admin) — cookie de sessão é enviado automaticamente */
export async function getCsvStatus(): Promise<{
  success: boolean;
  status?: {
    state?: { importedAt?: string; fileName?: string; totalRows?: number; created?: number; updated?: number; deactivated?: number };
    csvInfo?: { exists?: boolean; size?: number; mtimeMs?: number };
  };
}> {
  const res = await fetch(`${API_BASE_URL}/admin/csv/status`, { credentials: "same-origin" });
  return res.json();
}

/** Upload e processamento de CSV (admin) */
export async function uploadCsv(fileName: string, csvText: string): Promise<{
  success: boolean;
  imported?: boolean;
  reason?: string;
  stats?: { created?: number; updated?: number };
  error?: string;
}> {
  const res = await fetch(`${API_BASE_URL}/admin/csv/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ fileName, csvText }),
  });
  return res.json();
}
