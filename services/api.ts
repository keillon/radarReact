export const API_BASE_URL = "http://72.60.247.18:3000";

export interface Radar {
  id: string;
  latitude: number;
  longitude: number;
  speedLimit?: number;
  type?: string;
  situacao?: string | null;
}

export interface RoutePoint {
  latitude: number;
  longitude: number;
}

export interface NearRouteRequest {
  route: RoutePoint[];
  radius?: number; // em metros, padrão 100
}

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
  [key: string]: any; // outros campos que podem existir
}

// Mapear radares da API para o formato esperado
const mapApiRadarToRadar = (apiRadar: ApiRadarResponse): Radar => {
  return {
    id: apiRadar.id,
    latitude: apiRadar.latitude,
    longitude: apiRadar.longitude,
    speedLimit: apiRadar.velocidadeLeve || undefined,
    type: apiRadar.tipoRadar || "unknown",
    situacao: apiRadar.situacao ?? undefined,
  };
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

// Reportar um radar (POST) - com fallback para armazenamento local
export const reportRadar = async (
  request: ReportRadarRequest,
): Promise<Radar> => {
  try {
    const url = `${API_BASE_URL}/radars/report`;
    console.log(`📤 Reportando radar em: ${url}`);
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
      // Se o endpoint não existir (404), criar radar localmente
      if (response.status === 404) {
        console.log(
          `⚠️ Endpoint /radars/report não disponível (404), criando radar localmente`,
        );

        // Importar dinamicamente para evitar dependência circular
        const { createTempRadar, saveReportedRadarLocally } =
          await import("./reportedRadars");

        // Criar radar temporário
        const tempRadar = createTempRadar({
          latitude: request.latitude,
          longitude: request.longitude,
          speedLimit: request.speedLimit,
          type: request.type || "reportado",
        });

        // Salvar localmente
        await saveReportedRadarLocally(tempRadar);

        console.log(`✅ Radar criado localmente com ID: ${tempRadar.id}`);
        return tempRadar;
      }

      const errorText = await response.text();
      console.error(`❌ Erro HTTP ${response.status}: ${errorText}`);
      throw new Error(
        `Erro ao reportar radar: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    console.log(`✅ Radar reportado com sucesso no backend:`, data);

    const radar = mapApiRadarToRadar(data.radar || data);

    // Salvar também localmente para backup
    try {
      const { saveReportedRadarLocally } = await import("./reportedRadars");
      await saveReportedRadarLocally(radar);
    } catch (localError) {
      console.warn(
        "Erro ao salvar radar localmente (não crítico):",
        localError,
      );
    }

    return radar;
  } catch (error: any) {
    // Se for erro de rede ou timeout, criar radar localmente
    if (
      error?.message?.includes("Network") ||
      error?.message?.includes("timeout") ||
      error?.message?.includes("Failed to fetch")
    ) {
      console.log(`⚠️ Erro de rede ao reportar radar, criando localmente`);

      try {
        const { createTempRadar, saveReportedRadarLocally } =
          await import("./reportedRadars");

        const tempRadar = createTempRadar({
          latitude: request.latitude,
          longitude: request.longitude,
          speedLimit: request.speedLimit,
          type: request.type || "reportado",
        });

        await saveReportedRadarLocally(tempRadar);
        console.log(
          `✅ Radar criado localmente devido a erro de rede: ${tempRadar.id}`,
        );
        return tempRadar;
      } catch (localError) {
        console.error("Erro ao criar radar localmente:", localError);
      }
    }

    const errorDetails = {
      message: error?.message || "Erro desconhecido",
      stack: error?.stack,
      name: error?.name,
      url: `${API_BASE_URL}/radars/report`,
    };
    console.error(
      "Erro ao reportar radar:",
      JSON.stringify(errorDetails, null, 2),
    );
    throw new Error(`Erro ao reportar radar: ${errorDetails.message}`);
  }
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
