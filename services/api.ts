const API_BASE_URL = "http://72.60.247.18:3000";

export interface Radar {
  id: string;
  latitude: number;
  longitude: number;
  speedLimit?: number;
  type?: string;
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
  };
};

// Buscar radares próximos a uma localização (GET)
export const getRadarsNearLocation = async (
  latitude: number,
  longitude: number,
  radius: number = 1000 // em metros, padrão 1000m
): Promise<Radar[]> => {
  try {
    const url = `${API_BASE_URL}/radars?lat=${latitude}&lon=${longitude}&radius=${radius}`;
    console.log(`🔍 Buscando radares em: ${url}`);
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log(`📡 Resposta da API: status=${response.status}, ok=${response.ok}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Erro HTTP ${response.status}: ${errorText}`);
      throw new Error(`Erro ao buscar radares: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`📦 Dados recebidos:`, JSON.stringify(data).substring(0, 200));
    
    const radars = (data.radars || []).map(mapApiRadarToRadar);
    console.log(
      `✅ ${radars.length} radares encontrados próximos à localização`
    );
    return radars;
  } catch (error: any) {
    const errorDetails = {
      message: error?.message || "Erro desconhecido",
      stack: error?.stack,
      name: error?.name,
      url: url,
    };
    console.error("Erro ao buscar radares por localização:", JSON.stringify(errorDetails, null, 2));
    throw new Error(`Erro ao buscar radares: ${errorDetails.message}`);
  }
};

// Buscar radares próximos à rota (POST)
export const getRadarsNearRoute = async (
  request: NearRouteRequest
): Promise<Radar[]> => {
  try {
    const url = `${API_BASE_URL}/radars/near-route`;
    const requestBody = {
      route: request.route,
      radius: request.radius || 500, // Aumentado para 500m para capturar mais radares
    };
    
    console.log(`🔍 Buscando radares próximos à rota: ${url}`);
    console.log(`📋 Rota com ${request.route.length} pontos, raio=${request.radius || 500}m`);
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`📡 Resposta da API: status=${response.status}, ok=${response.ok}`);

    if (!response.ok) {
      const errorText = await response.text();
      // Se for 404, a rota não existe - usar fallback silenciosamente
      if (response.status === 404) {
        console.log(`⚠️ Rota /radars/near-route não disponível (404), usando fallback`);
        throw new Error("ROUTE_NOT_FOUND"); // Erro especial para identificar 404
      }
      console.error(`❌ Erro HTTP ${response.status}: ${errorText}`);
      throw new Error(`Erro ao buscar radares: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`📦 Dados recebidos:`, JSON.stringify(data).substring(0, 200));
    
    const radars = (data.radars || []).map(mapApiRadarToRadar);
    console.log(`✅ ${radars.length} radares encontrados próximos à rota`);
    return radars;
  } catch (error: any) {
    // Se for erro 404 (rota não existe), usar fallback silenciosamente
    if (error?.message === "ROUTE_NOT_FOUND" || error?.message?.includes("404")) {
      console.log("🔄 Usando fallback: buscando radares por localização média da rota");
    } else {
      const errorDetails = {
        message: error?.message || "Erro desconhecido",
        stack: error?.stack,
        name: error?.name,
        url: `${API_BASE_URL}/radars/near-route`,
      };
      console.error("Erro ao buscar radares por rota:", JSON.stringify(errorDetails, null, 2));
    }
    
    // Se falhar, tentar buscar por localização média da rota
    if (request.route && request.route.length > 0) {
      const midPoint = request.route[Math.floor(request.route.length / 2)];
      console.log(`📍 Buscando radares próximos ao ponto médio da rota (${midPoint.latitude}, ${midPoint.longitude})`);
      return getRadarsNearLocation(
        midPoint.latitude,
        midPoint.longitude,
        request.radius || 1000
      ).catch((fallbackError: any) => {
        console.error("❌ Erro no fallback:", fallbackError?.message || "Erro desconhecido");
        return []; // Retornar array vazio em vez de lançar erro
      });
    }
    return []; // Retornar array vazio em vez de lançar erro
  }
};
