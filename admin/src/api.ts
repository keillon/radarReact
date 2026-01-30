const API_BASE_URL = import.meta.env.VITE_API_URL || "http://72.60.247.18:3000";

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
}

interface ApiRadarResponse {
  id: string;
  latitude: number;
  longitude: number;
  velocidadeLeve?: number | null;
  tipoRadar?: string;
  [key: string]: unknown;
}

const mapApi = (r: ApiRadarResponse): Radar => ({
  id: r.id,
  latitude: r.latitude,
  longitude: r.longitude,
  speedLimit: r.velocidadeLeve ?? undefined,
  type: r.tipoRadar ?? "unknown",
});

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
