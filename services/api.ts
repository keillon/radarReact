export const API_BASE_URL = "http://72.60.247.18:3000";

import type { NearRouteRequest, Radar } from "./types";
export type { LatLng, NearRouteRequest, Radar } from "./types";


// Interface para a resposta da API (formato real retornado)
interface ApiRadarResponse {
  id: string;
  latitude: number;
  longitude: number;
  velocidadeLeve?: number | null;
  velocidadePesado?: number | null;
  tipoRadar?: string;
  rodovia?: string | null;
  uf?: string | null;
  municipio?: string | null;
  situacao?: string | null;
  ativo?: boolean;
  confirms?: number;
  denies?: number;
  source?: string | null;
  createdAt?: string | number; // ISO string ou timestamp
  reportedBy?: string | null;
  [key: string]: any; // outros campos que podem existir
}

// Mapear radares da API para o formato esperado
const mapApiRadarToRadar = (apiRadar: ApiRadarResponse): Radar => {
  let createdAtMs: number | undefined;
  if (apiRadar.createdAt != null) {
    if (typeof apiRadar.createdAt === "number") createdAtMs = apiRadar.createdAt;
    else if (typeof apiRadar.createdAt === "string")
      createdAtMs = new Date(apiRadar.createdAt).getTime();
  }
  return {
    id: apiRadar.id,
    latitude: apiRadar.latitude,
    longitude: apiRadar.longitude,
    speedLimit: apiRadar.velocidadeLeve || undefined,
    type: apiRadar.tipoRadar || "unknown",
    situacao: apiRadar.situacao ?? undefined,
    ativo: apiRadar.ativo,
    confirms: apiRadar.confirms,
    denies: apiRadar.denies,
    source: apiRadar.source ?? undefined,
    rodovia: apiRadar.rodovia ?? undefined,
    municipio: apiRadar.municipio ?? undefined,
    uf: apiRadar.uf ?? undefined,
    createdAt: createdAtMs,
    reportedAt: createdAtMs,
    reportedBy: apiRadar.reportedBy ?? undefined,
  };
};

/** Retorna timestamp (ms) da última atualização dos radares (CSV, report, etc.) */
export const getRadarsLastUpdated = async (): Promise<number> => {
  try {
    const response = await fetch(`${API_BASE_URL}/radars/last-updated`);
    if (!response.ok) return 0;
    const data = await response.json();
    return Number(data?.lastUpdated ?? 0) || 0;
  } catch {
    return 0;
  }
};

// Buscar radares próximos a uma localização (GET)
export const getRadarsNearLocation = async (
  latitude: number,
  longitude: number,
  radius: number = 1000, // em metros, padrão 1000m
): Promise<Radar[]> => {
  const url = `${API_BASE_URL}/radars?lat=${latitude}&lon=${longitude}&radius=${radius}`;
  
  try {
    console.log(`🔍 Buscando radares em: ${url}`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log(
      `📡 Resposta da API: status=${response.status}, ok=${response.ok}`,
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText };
      }
      console.error(`❌ Erro HTTP ${response.status}:`, errorData);
      throw new Error(
        errorData.error || errorData.details || `Erro ao buscar radares: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    console.log(`📦 Dados recebidos:`, JSON.stringify(data).substring(0, 200));

    const radars = (data.radars || []).map(mapApiRadarToRadar);
    console.log(
      `✅ ${radars.length} radares encontrados próximos à localização`,
    );
    return radars;
  } catch (error: any) {
    const errorDetails = {
      message: error?.message || "Erro desconhecido",
      stack: error?.stack,
      name: error?.name,
      url: url,
    };
    console.error(
      "Erro ao buscar radares por localização:",
      JSON.stringify(errorDetails, null, 2),
    );
    throw error; // Re-throw o erro original para manter a stack trace
  }
};

// Buscar radares próximos à rota (POST)
export const getRadarsNearRoute = async (
  request: NearRouteRequest,
): Promise<Radar[]> => {
  try {
    const url = `${API_BASE_URL}/radars/near-route`;
    const requestBody = {
      route: request.route,
      radius: request.radius || 500, // Aumentado para 500m para capturar mais radares
    };

    console.log(`🔍 Buscando radares próximos à rota: ${url}`);
    console.log(
      `📋 Rota com ${request.route.length} pontos, raio=${request.radius || 500}m`,
    );

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log(
      `📡 Resposta da API: status=${response.status}, ok=${response.ok}`,
    );

    if (!response.ok) {
      const errorText = await response.text();
      // Se for 404, a rota não existe - usar fallback silenciosamente
      if (response.status === 404) {
        console.log(
          `⚠️ Rota /radars/near-route não disponível (404), usando fallback`,
        );
        throw new Error("ROUTE_NOT_FOUND"); // Erro especial para identificar 404
      }
      console.error(`❌ Erro HTTP ${response.status}: ${errorText}`);
      throw new Error(
        `Erro ao buscar radares: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    console.log(`📦 Dados recebidos:`, JSON.stringify(data).substring(0, 200));

    const radars = (data.radars || []).map(mapApiRadarToRadar);
    console.log(`✅ ${radars.length} radares encontrados próximos à rota`);
    return radars;
  } catch (error: any) {
    // Se for erro 404 (rota não existe), usar fallback silenciosamente
    if (
      error?.message === "ROUTE_NOT_FOUND" ||
      error?.message?.includes("404")
    ) {
      console.log(
        "🔄 Usando fallback: buscando radares por localização média da rota",
      );
    } else {
      const errorDetails = {
        message: error?.message || "Erro desconhecido",
        stack: error?.stack,
        name: error?.name,
        url: `${API_BASE_URL}/radars/near-route`,
      };
      console.error(
        "Erro ao buscar radares por rota:",
        JSON.stringify(errorDetails, null, 2),
      );
    }

    // Se falhar, tentar buscar por localização média da rota
    if (request.route && request.route.length > 0) {
      const midPoint = request.route[Math.floor(request.route.length / 2)];
      console.log(
        `📍 Buscando radares próximos ao ponto médio da rota (${midPoint.latitude}, ${midPoint.longitude})`,
      );
      return getRadarsNearLocation(
        midPoint.latitude,
        midPoint.longitude,
        request.radius || 1000,
      ).catch((fallbackError: any) => {
        console.error(
          "❌ Erro no fallback:",
          fallbackError?.message || "Erro desconhecido",
        );
        return []; // Retornar array vazio em vez de lançar erro
      });
    }
    return []; // Retornar array vazio em vez de lançar erro
  }
};

// Interface para reportar um radar
export interface ReportRadarRequest {
  latitude: number;
  longitude: number;
  speedLimit?: number;
  type?: string;
  reportedBy?: string; // ID do usuário que reportou (opcional)
}

// Reportar um radar (POST) - com retry automático em caso de falha de rede
export const reportRadar = async (
  request: ReportRadarRequest,
): Promise<Radar> => {
  const maxRetries = 3;
  const delays = [500, 1000, 2000]; // Backoff exponencial: 500ms, 1s, 2s

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const url = `${API_BASE_URL}/radars/report`;
      console.log(`📤 Reportando radar (tentativa ${attempt + 1}/${maxRetries + 1}): ${url}`);
      console.log(
        `📍 Localização: lat=${request.latitude}, lon=${request.longitude}`,
      );

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          latitude: request.latitude,
          longitude: request.longitude,
          velocidadeLeve: request.speedLimit || null,
          tipoRadar: request.type || "reportado",
          reportedBy: request.reportedBy || "anonymous",
        }),
      });

      console.log(
        `📡 Resposta da API: status=${response.status}, ok=${response.ok}`,
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Erro HTTP ${response.status}: ${errorText}`);
        throw new Error(
          `Erro ao reportar radar: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      console.log(`✅ Radar reportado com sucesso no backend:`, data);

      const radar = mapApiRadarToRadar(data.radar || data);
      return radar;
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries;
      
      // Se for erro de rede/timeout e não for última tentativa, fazer retry
      if (
        !isLastAttempt &&
        (error?.message?.includes("Network") ||
          error?.message?.includes("timeout") ||
          error?.message?.includes("Failed to fetch") ||
          error?.message?.includes("Indisponível"))
      ) {
        const delay = delays[attempt] || 2000;
        console.warn(`⚠️ Falha na tentativa ${attempt + 1}, aguardando ${delay}ms antes de tentar novamente...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue; // Próxima tentativa
      }

      // Se for última tentativa ou erro não-retryable, throw
      const errorDetails = {
        message: error?.message || "Erro desconhecido",
        stack: error?.stack,
        name: error?.name,
        url: `${API_BASE_URL}/radars/report`,
      };
      console.error(
        "Erro ao reportar radar (após todas as tentativas):",
        JSON.stringify(errorDetails, null, 2),
      );
      throw new Error(`Erro ao reportar radar: ${errorDetails.message}`);
    }
  }

  // Fallback (nunca deve chegar aqui devido ao loop, mas TS precisa)
  throw new Error("Erro inesperado ao reportar radar");
};

// Atualizar radar (PATCH) - para o editor: mover posição, limite, inativar
export interface UpdateRadarRequest {
  latitude?: number;
  longitude?: number;
  speedLimit?: number;
  situacao?: string; // ex: "ativo" | "inativo"
}

export const updateRadar = async (
  id: string,
  request: UpdateRadarRequest,
): Promise<Radar | null> => {
  try {
    const url = `${API_BASE_URL}/radars/${id}`;
    const body: Record<string, unknown> = {};
    if (request.latitude != null) body.latitude = request.latitude;
    if (request.longitude != null) body.longitude = request.longitude;
    if (request.speedLimit != null) body.velocidadeLeve = request.speedLimit;
    if (request.situacao != null) body.situacao = request.situacao;

    const response = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.warn("Endpoint PATCH /radars/:id não disponível");
        return null;
      }
      const text = await response.text();
      throw new Error(`Erro ao atualizar radar: ${response.status} ${text}`);
    }

    const data = await response.json();
    return mapApiRadarToRadar(data.radar || data);
  } catch (error: any) {
    console.error("Erro ao atualizar radar:", error?.message);
    return null;
  }
};

// Deletar ou inativar radar (DELETE)
export const deleteRadar = async (id: string): Promise<boolean> => {
  try {
    const url = `${API_BASE_URL}/radars/${id}`;
    const response = await fetch(url, { method: "DELETE" });

    if (!response.ok) {
      if (response.status === 404) {
        console.warn("Endpoint DELETE /radars/:id não disponível");
        return false;
      }
      const text = await response.text();
      throw new Error(`Erro ao deletar radar: ${response.status} ${text}`);
    }
    return true;
  } catch (error: any) {
    console.error("Erro ao deletar radar:", error?.message);
    return false;
  }
};

// Buscar radares reportados recentemente (GET) - para sincronização em tempo real
export const getRecentRadars = async (
  since?: number, // timestamp em ms - apenas radares reportados após este timestamp
): Promise<Radar[]> => {
  try {
    const url = since
      ? `${API_BASE_URL}/radars/recent?since=${since}`
      : `${API_BASE_URL}/radars/recent`;
    console.log(`🔄 Buscando radares recentes: ${url}`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log(
      `📡 Resposta da API: status=${response.status}, ok=${response.ok}`,
    );

    if (!response.ok) {
      // Se o endpoint não existir, retornar array vazio (não é crítico)
      if (response.status === 404) {
        console.log(
          `⚠️ Endpoint /radars/recent não disponível (404), retornando array vazio`,
        );
        return [];
      }
      const errorText = await response.text();
      console.error(`❌ Erro HTTP ${response.status}: ${errorText}`);
      return []; // Retornar array vazio em vez de lançar erro
    }

    const data = await response.json();
    const radars = (data.radars || []).map(mapApiRadarToRadar);
    console.log(`✅ ${radars.length} radares recentes encontrados`);
    return radars;
  } catch (error: any) {
    console.error(
      "Erro ao buscar radares recentes:",
      error?.message || "Erro desconhecido",
    );
    return []; // Retornar array vazio em vez de lançar erro
  }
};

// Crowdsourcing: confirmar existência do radar (1 ação por usuário/radar)
export const confirmRadar = async (
  radarId: string,
  userId: string
): Promise<Radar | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/radars/${radarId}/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      const text = await response.text();
      let data: { alreadyConfirmed?: boolean; alreadyDenied?: boolean } = {};
      try {
        data = JSON.parse(text);
      } catch {}
      if (data.alreadyConfirmed || data.alreadyDenied) return null;
      throw new Error(text || `Erro ao confirmar radar (${response.status})`);
    }

    const data = await response.json();
    return mapApiRadarToRadar(data.radar || data);
  } catch (error: any) {
    console.error("Erro ao confirmar radar:", error?.message || error);
    return null;
  }
};

// Crowdsourcing: negar existência do radar (1 ação por usuário/radar)
export const denyRadar = async (
  radarId: string,
  userId: string
): Promise<Radar | null> => {
  try {
    const response = await fetch(`${API_BASE_URL}/radars/${radarId}/deny`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      const text = await response.text();
      let data: { alreadyConfirmed?: boolean; alreadyDenied?: boolean } = {};
      try {
        data = JSON.parse(text);
      } catch {}
      if (data.alreadyConfirmed || data.alreadyDenied) return null;
      throw new Error(text || `Erro ao negar radar (${response.status})`);
    }

    const data = await response.json();
    return mapApiRadarToRadar(data.radar || data);
  } catch (error: any) {
    console.error("Erro ao negar radar:", error?.message || error);
    return null;
  }
};
