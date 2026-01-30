import { prisma } from "../utils/prisma";
import * as XLSX from "xlsx";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require("pdf-parse") as (
  buffer: Buffer
) => Promise<{ text: string }>;

export interface RadarSource {
  latitude: number;
  longitude: number;
  source: string; // "antt" | "der-sp" | "gps-data-team" | "curitiba"
  metadata?: any;
}

/**
 * Buscar radares da ANTT (Agência Nacional de Transportes Terrestres)
 * Formato: JSON oficial disponível em dados.antt.gov.br
 * Licença: CC-BY 4.0 (Creative Commons Attribution 4.0 International)
 * Fonte: https://dados.antt.gov.br/dataset/79d287f4-f5ca-4385-a17c-f61f53831f17/resource/fa861690-70de-4a27-a82f-0eee74abdbc0/download/dados_dos_radares.json
 */
export async function fetchANTTRadars(): Promise<RadarSource[]> {
  try {
    console.log("📡 Buscando radares ANTT (JSON oficial)...");

    // Verificar se já existe arquivo local antes de baixar
    const fs = require("fs");
    const path = require("path");
    const localFile = path.join(
      process.cwd(),
      "radarsFiles",
      "dados_dos_radares.json"
    );

    let data: any = null;
    let response: Response | null = null;

    // Tentar usar arquivo local primeiro
    if (fs.existsSync(localFile)) {
      try {
        console.log(`   📂 Usando arquivo local: ${localFile}`);
        const fileContent = fs.readFileSync(localFile, "utf-8");
        data = JSON.parse(fileContent);
        console.log(`   ✅ Arquivo local carregado com sucesso!`);
      } catch (err) {
        console.warn(`   ⚠️ Erro ao ler arquivo local, baixando novamente...`);
      }
    }

    // Se não conseguiu usar arquivo local, baixar
    if (!data) {
      // URL oficial do JSON da ANTT (atualizado automaticamente)
      const jsonUrl =
        "https://dados.antt.gov.br/dataset/79d287f4-f5ca-4385-a17c-f61f53831f17/resource/fa861690-70de-4a27-a82f-0eee74abdbc0/download/dados_dos_radares.json";

      try {
        console.log(`   📥 Baixando JSON oficial: ${jsonUrl}`);
        response = await fetch(jsonUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept: "application/json",
          },
        });

        if (response.ok) {
          data = await response.json();
          console.log(
            `   ✅ JSON baixado com sucesso! Tamanho: ${
              JSON.stringify(data).length
            } bytes`
          );

          // Salvar arquivo local para uso futuro
          const dir = path.dirname(localFile);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(localFile, JSON.stringify(data), "utf-8");
          console.log(`   💾 Arquivo salvo localmente para uso futuro`);
        } else {
          console.error(
            `   ❌ Falhou: ${response.status} ${response.statusText}`
          );
          return [];
        }
      } catch (err) {
        console.error(`   ❌ Erro ao baixar JSON: ${err}`);
        return [];
      }
    }

    if (!data) {
      console.error("❌ Não foi possível obter dados da ANTT");
      return [];
    }

    // Formato oficial da ANTT: { "radar": [...] }
    let records: any[] = [];
    if (data.radar && Array.isArray(data.radar)) {
      records = data.radar;
      console.log(`   ✅ Formato ANTT detectado: ${records.length} radares`);
    } else if (Array.isArray(data)) {
      records = data;
      console.log(`   ✅ Array direto detectado: ${records.length} registros`);
    } else {
      console.error("❌ Formato JSON não reconhecido");
      return [];
    }

    console.log(`   📊 Total de registros encontrados: ${records.length}`);

    if (records.length === 0) {
      console.warn("⚠️ JSON vazio ou sem dados");
      return [];
    }

    // Processar JSON oficial da ANTT
    const radars: RadarSource[] = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      try {
        let lat: number | null = null;
        let lon: number | null = null;

        // Formato ANTT: latitude e longitude como strings com vírgula (ex: "-23,401335")
        if (record.latitude !== undefined && record.latitude !== null) {
          const latStr = String(record.latitude).replace(",", ".");
          lat = parseFloat(latStr);
          if (isNaN(lat) || lat < -35 || lat > 5) {
            lat = null;
          }
        }

        if (record.longitude !== undefined && record.longitude !== null) {
          const lonStr = String(record.longitude).replace(",", ".");
          lon = parseFloat(lonStr);
          if (isNaN(lon) || lon < -75 || lon > -30) {
            lon = null;
          }
        }

        if (lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon)) {
          // Extrair velocidade do formato ANTT (string: "80", "100", "110")
          let velocidadeLeve: number | null = null;
          if (record.velocidade_leve) {
            const velStr = String(record.velocidade_leve).trim();
            const velNum = parseInt(velStr);
            if (!isNaN(velNum) && velNum > 0 && velNum <= 200) {
              velocidadeLeve = velNum;
            }
          }

          // Extrair km do formato ANTT (string com vírgula: "78,200")
          let km: number | null = null;
          if (record.km_m) {
            const kmStr = String(record.km_m).replace(",", ".");
            const kmNum = parseFloat(kmStr);
            if (!isNaN(kmNum) && kmNum > 0) {
              km = kmNum;
            }
          }

          radars.push({
            latitude: lat,
            longitude: lon,
            source: "antt",
            metadata: {
              raw: record,
              rodovia: record.rodovia || null,
              uf: record.uf || null,
              municipio: record.municipio || null,
              km: km,
              tipoRadar: record.tipo_de_radar || record.tipoRadar || null,
              velocidadeLeve: velocidadeLeve,
              velocidadePesado: null, // Formato ANTT não tem velocidade pesado separada
              sentido: record.sentido || null,
              situacao: record.situacao || null,
              concessionaria: record.concessionaria || null,
              license: "CC-BY 4.0",
              attribution:
                "Dados abertos da ANTT (Agência Nacional de Transportes Terrestres). Licenciado sob Creative Commons Attribution 4.0 International (CC-BY 4.0). Fonte: https://dados.antt.gov.br/",
            },
          });
        }
      } catch (error) {
        if (i < 5) {
          console.error(`   ⚠️ Erro ao processar radar ${i + 1}:`, error);
        }
        continue;
      }
    }

    console.log(`✅ Radares ANTT carregados: ${radars.length}`);
    return radars;
  } catch (error) {
    console.error("❌ Erro ao buscar radares ANTT:", error);
    return [];
  }
}

/**
 * Processar arquivo XLSX e extrair radares
 */
async function processXLSXFile(
  buffer: ArrayBuffer,
  source: string
): Promise<RadarSource[]> {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const radars: RadarSource[] = [];

    // Processar todas as planilhas
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { raw: false });

      if (data.length === 0) continue;

      console.log(`   📊 Planilha "${sheetName}": ${data.length} linhas`);

      // Detectar cabeçalhos (primeira linha)
      const firstRow = data[0] as any;
      const headers = Object.keys(firstRow).map((key) => key.toLowerCase());

      // Encontrar índices das colunas
      let latIndex = -1;
      let lonIndex = -1;
      let coordenadasIndex = -1; // Coluna que pode conter coordenadas combinadas
      let rodoviaIndex = -1;
      let ufIndex = -1;
      let municipioIndex = -1;
      let kmIndex = -1;
      let tipoRadarIndex = -1;
      let velocidadeLeveIndex = -1;
      let velocidadePesadoIndex = -1;
      let sentidoIndex = -1;
      let situacaoIndex = -1;
      let concessionariaIndex = -1;

      // Variáveis para armazenar os nomes exatos das colunas
      let localizacao2Key: string | null = null;
      let velocidadeKey: string | null = null;

      Object.keys(firstRow).forEach((key, index) => {
        const col = key.toLowerCase();
        if (col.includes("lat") && !col.includes("lon")) {
          latIndex = index;
        }
        if (
          col.includes("lon") ||
          col.includes("lng") ||
          (col.includes("long") && !col.includes("lat"))
        ) {
          lonIndex = index;
        }
        if (col.includes("coordenada")) {
          coordenadasIndex = index;
        }
        // Detectar rodovia - várias variações
        if (
          col.includes("rodovia") ||
          col.includes("highway") ||
          col.includes("road") ||
          col.includes("br") ||
          col === "rodovia" ||
          col === "estrada"
        ) {
          rodoviaIndex = index;
        }
        // Detectar UF/Estado - várias variações
        if (
          col === "uf" ||
          col === "estado" ||
          col.includes("estado") ||
          col.includes("state") ||
          col === "uf_estado" ||
          col === "estado_uf"
        ) {
          ufIndex = index;
        }
        // Detectar município/cidade - várias variações
        if (
          col.includes("municipio") ||
          col.includes("cidade") ||
          col.includes("city") ||
          col.includes("município") ||
          col === "municipio" ||
          col === "cidade" ||
          col === "municipio_cidade" ||
          col === "cidade_municipio"
        ) {
          municipioIndex = index;
        }
        // Detectar "Localização2" para extrair km (formato: "Km XXX + YYY m")
        if (
          col.includes("localização2") ||
          col.includes("localizacao2") ||
          (col.includes("localização") && col.includes("2")) ||
          (col.includes("localizacao") && col.includes("2"))
        ) {
          kmIndex = index;
          localizacao2Key = key;
        }
        // Detectar coluna "km" simples (sem "h" ou "hora")
        if (
          col.includes("km") &&
          !col.includes("h") &&
          !col.includes("hora") &&
          kmIndex === -1
        ) {
          kmIndex = index;
        }
        if (col.includes("tipo") && col.includes("radar")) {
          tipoRadarIndex = index;
        }
        // Detectar coluna "Velocidade" (formato: "XXX/YYY Km/h") - várias variações
        if (
          (col.includes("velocidade") ||
            col.includes("speed") ||
            col === "vel" ||
            col === "velocidade") &&
          !col.includes("leve") &&
          !col.includes("pesado") &&
          !col.includes("light") &&
          !col.includes("heavy") &&
          !velocidadeKey
        ) {
          velocidadeKey = key;
          // Esta coluna será processada depois para extrair leve e pesado
        }
        // Detectar velocidade leve - várias variações
        if (
          (col.includes("velocidade") ||
            col.includes("speed") ||
            col.includes("vel")) &&
          (col.includes("leve") ||
            col.includes("ligero") ||
            col.includes("light") ||
            col.includes("auto") ||
            col.includes("carro") ||
            col.includes("car") ||
            col === "velocidade_leve" ||
            col === "velocidadeleve" ||
            col === "vel_leve")
        ) {
          velocidadeLeveIndex = index;
        }
        // Detectar velocidade pesado - várias variações
        if (
          (col.includes("velocidade") ||
            col.includes("speed") ||
            col.includes("vel")) &&
          (col.includes("pesado") ||
            col.includes("pesado") ||
            col.includes("heavy") ||
            col.includes("caminhao") ||
            col.includes("truck") ||
            col.includes("onibus") ||
            col === "velocidade_pesado" ||
            col === "velocidadepesado" ||
            col === "vel_pesado")
        ) {
          velocidadePesadoIndex = index;
        }
        if (col.includes("sentido")) {
          sentidoIndex = index;
        }
        if (col.includes("situacao") || col.includes("situa")) {
          situacaoIndex = index;
        }
        // Detectar "Conces." ou "Concessionária"
        if (
          col.includes("concessionaria") ||
          col.includes("concession") ||
          col.includes("conces")
        ) {
          concessionariaIndex = index;
        }
      });

      // Obter nomes das colunas uma vez
      const columnKeys = Object.keys(firstRow);
      console.log(
        `   📋 Colunas encontradas: ${columnKeys.slice(0, 10).join(", ")}${
          columnKeys.length > 10 ? "..." : ""
        }`
      );
      console.log(
        `   📍 Índices encontrados - Lat: ${
          latIndex >= 0 ? columnKeys[latIndex] : "não encontrado"
        }, Lon: ${
          lonIndex >= 0 ? columnKeys[lonIndex] : "não encontrado"
        }, Coordenadas: ${
          coordenadasIndex >= 0
            ? columnKeys[coordenadasIndex]
            : "não encontrado"
        }, VelocidadeLeve: ${
          velocidadeLeveIndex >= 0
            ? columnKeys[velocidadeLeveIndex]
            : "não encontrado"
        }, VelocidadePesado: ${
          velocidadePesadoIndex >= 0
            ? columnKeys[velocidadePesadoIndex]
            : "não encontrado"
        }, Velocidade (combinada): ${velocidadeKey || "não encontrado"}`
      );

      // Processar cada linha
      let processedCount = 0;
      let skippedCount = 0;

      for (const row of data as any[]) {
        try {
          const getValue = (key: string): string | null => {
            if (!key || !row[key]) return null;
            const val = String(row[key]).trim();
            return val !== "" && val !== "null" && val !== "undefined"
              ? val
              : null;
          };

          const parseFloatValue = (key: string): number | null => {
            const val = getValue(key);
            if (!val) return null;
            const num = parseFloat(val.replace(",", "."));
            return !isNaN(num) ? num : null;
          };

          // Função para processar coordenadas em formato string (ex: "-23.6768565,-46.3995311")
          const parseCoordenadas = (
            coordStr: string | null
          ): { lat: number | null; lon: number | null } => {
            if (!coordStr) return { lat: null, lon: null };

            const str = String(coordStr).trim();

            // Formato: "-23.6768565,-46.3995311" ou "-23.6768565, -46.3995311"
            if (str.includes(",")) {
              const parts = str.split(",").map((p) => p.trim());
              if (parts.length >= 2) {
                const latVal = parseFloat(parts[0].replace(",", "."));
                const lonVal = parseFloat(parts[1].replace(",", "."));
                if (!isNaN(latVal) && !isNaN(lonVal)) {
                  return { lat: latVal, lon: lonVal };
                }
              }
            }

            // Formato: "-23.6768565 -46.3995311" (separado por espaço)
            const spaceParts = str.split(/\s+/);
            if (spaceParts.length >= 2) {
              const latVal = parseFloat(spaceParts[0].replace(",", "."));
              const lonVal = parseFloat(spaceParts[1].replace(",", "."));
              if (
                !isNaN(latVal) &&
                !isNaN(lonVal) &&
                latVal >= -35 &&
                latVal <= 5 &&
                lonVal >= -75 &&
                lonVal <= -30
              ) {
                return { lat: latVal, lon: lonVal };
              }
            }

            return { lat: null, lon: null };
          };

          // Função para processar velocidade (ex: "100/080 Km/h" -> leve: 100, pesado: 80)
          const parseVelocidade = (
            velStr: string | null
          ): { leve: number | null; pesado: number | null } => {
            if (!velStr) return { leve: null, pesado: null };

            let str = String(velStr).trim();

            // Remover unidades comuns (km/h, km, kmh, h, etc.)
            str = str.replace(/\s*(km\/h|kmh|km|h)\s*/gi, "");

            // Formato: "100/080 Km/h" ou "100/080" ou "100/80"
            const match = str.match(
              /(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/
            );
            if (match && match.length >= 3) {
              const leve = parseFloat(match[1].replace(",", "."));
              const pesado = parseFloat(match[2].replace(",", "."));
              if (!isNaN(leve) && !isNaN(pesado) && leve > 0 && leve <= 200) {
                return {
                  leve,
                  pesado: pesado > 0 && pesado <= 200 ? pesado : null,
                };
              }
            }

            // Lidar com condições (<=, >=, <, >)
            str = str.replace(/^[<>=]+\s*/, "");

            // Tentar extrair range (ex: "121 - 140", "21-50")
            const rangeMatch = str.match(
              /(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)/
            );
            if (rangeMatch) {
              const num1 = parseFloat(rangeMatch[1].replace(",", "."));
              const num2 = parseFloat(rangeMatch[2].replace(",", "."));
              if (!isNaN(num1) && !isNaN(num2) && num1 > 0 && num1 <= 200) {
                // Retornar o primeiro número do range
                return { leve: num1, pesado: null };
              }
            }

            // Tentar apenas um número
            const singleNum = parseFloat(
              str.replace(/[^\d.,]/g, "").replace(",", ".")
            );
            if (!isNaN(singleNum) && singleNum > 0 && singleNum <= 200) {
              return { leve: singleNum, pesado: null };
            }

            return { leve: null, pesado: null };
          };

          // Função para processar "Localização2" e extrair km (formato: "Km XXX + YYY m")
          const parseLocalizacao2 = (locStr: string | null): number | null => {
            if (!locStr) return null;

            const str = String(locStr).trim();
            // Formato: "Km 095 + 700 m" -> extrair 95.7 (km + metros/1000)
            const match = str.match(/km\s*(\d+)\s*\+\s*(\d+)\s*m/i);
            if (match && match.length >= 3) {
              const km = parseInt(match[1]);
              const metros = parseInt(match[2]);
              if (!isNaN(km) && !isNaN(metros)) {
                return km + metros / 1000;
              }
            }

            // Tentar apenas o número do km
            const kmMatch = str.match(/km\s*(\d+)/i);
            if (kmMatch && kmMatch.length >= 2) {
              const km = parseInt(kmMatch[1]);
              if (!isNaN(km)) {
                return km;
              }
            }

            return null;
          };

          let lat: number | null = null;
          let lon: number | null = null;

          // PRIMEIRO: Tentar coluna "Coordenadas" (formato: "-23.6768565,-46.3995311")
          if (coordenadasIndex >= 0 && columnKeys[coordenadasIndex]) {
            const coordValue = getValue(columnKeys[coordenadasIndex]);
            if (coordValue) {
              const parsed = parseCoordenadas(coordValue);
              if (parsed.lat !== null && parsed.lon !== null) {
                lat = parsed.lat;
                lon = parsed.lon;
              }
            }
          }

          // Se não encontrou na coluna Coordenadas, tentar pelos nomes das colunas encontradas
          if (
            (lat === null || lon === null) &&
            latIndex >= 0 &&
            columnKeys[latIndex]
          ) {
            lat = parseFloatValue(columnKeys[latIndex]);
          }
          if (
            (lat === null || lon === null) &&
            lonIndex >= 0 &&
            columnKeys[lonIndex]
          ) {
            lon = parseFloatValue(columnKeys[lonIndex]);
          }

          // Se ainda não encontrou, procurar por nomes de colunas comuns
          if (lat === null || lon === null) {
            for (const key of columnKeys) {
              const keyLower = key.toLowerCase();
              // Tentar processar coluna "Coordenadas" se existir
              if (
                (lat === null || lon === null) &&
                keyLower.includes("coordenada")
              ) {
                const coordValue = getValue(key);
                if (coordValue) {
                  const parsed = parseCoordenadas(coordValue);
                  if (parsed.lat !== null && parsed.lon !== null) {
                    lat = parsed.lat;
                    lon = parsed.lon;
                  }
                }
              }
              if (
                lat === null &&
                keyLower.includes("lat") &&
                !keyLower.includes("lon")
              ) {
                const val = parseFloatValue(key);
                if (val !== null && val >= -35 && val <= 5) {
                  lat = val;
                }
              }
              if (
                lon === null &&
                (keyLower.includes("lon") ||
                  keyLower.includes("lng") ||
                  (keyLower.includes("long") && !keyLower.includes("lat")))
              ) {
                const val = parseFloatValue(key);
                if (val !== null && val >= -75 && val <= -30) {
                  lon = val;
                }
              }
            }
          }

          // Se ainda não encontrou, procurar em todas as colunas por valores numéricos válidos
          if (lat === null || lon === null) {
            for (const key of columnKeys) {
              const val = row[key];
              if (val !== null && val !== undefined && val !== "") {
                const num = parseFloat(String(val).replace(",", "."));
                if (!isNaN(num)) {
                  if (num >= -35 && num <= 5 && lat === null) {
                    lat = num;
                  } else if (num >= -75 && num <= -30 && lon === null) {
                    lon = num;
                  }
                }
              }
            }
          }

          if (lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon)) {
            // Processar velocidade da coluna "Velocidade" se existir
            let velocidadeLeve: number | null = null;
            let velocidadePesado: number | null = null;

            if (velocidadeKey) {
              const velValue = getValue(velocidadeKey);
              const parsedVel = parseVelocidade(velValue);
              velocidadeLeve = parsedVel.leve;
              velocidadePesado = parsedVel.pesado;
            } else {
              // Fallback para colunas separadas
              if (velocidadeLeveIndex >= 0 && columnKeys[velocidadeLeveIndex]) {
                const velValue = getValue(columnKeys[velocidadeLeveIndex]);
                const parsed = parseVelocidade(velValue);
                velocidadeLeve = parsed.leve;
                if (parsed.pesado) {
                  velocidadePesado = parsed.pesado;
                }
              }
              if (
                velocidadePesadoIndex >= 0 &&
                columnKeys[velocidadePesadoIndex]
              ) {
                const velValue = getValue(columnKeys[velocidadePesadoIndex]);
                const parsed = parseVelocidade(velValue);
                if (parsed.leve) {
                  velocidadePesado = parsed.leve; // Se não tiver pesado, usar o leve
                } else if (parsed.pesado) {
                  velocidadePesado = parsed.pesado;
                }
              }
            }

            // Processar km da coluna "Localização2" se existir
            let km: number | null = null;
            if (localizacao2Key) {
              const loc2Value = getValue(localizacao2Key);
              km = parseLocalizacao2(loc2Value);
            } else if (kmIndex >= 0 && columnKeys[kmIndex]) {
              km = parseFloatValue(columnKeys[kmIndex]);
            }

            // Definir licença e atribuição baseado na fonte
            let license = "CC-BY 4.0";
            let attribution = "";

            if (source === "der-sp") {
              license = "CC-BY 4.0";
              attribution =
                "Dados abertos do DER-SP (Departamento de Estradas de Rodagem de São Paulo). Licenciado sob Creative Commons Attribution 4.0 International (CC-BY 4.0). Fonte: https://www.der.sp.gov.br/WebSite/Arquivos/DadosAbertos/";
            } else if (source === "antt") {
              license = "CC-BY 4.0";
              attribution =
                "Dados abertos da ANTT (Agência Nacional de Transportes Terrestres). Licenciado sob Creative Commons Attribution 4.0 International (CC-BY 4.0). Fonte: https://dados.antt.gov.br/";
            } else if (source === "curitiba") {
              license = "CC-BY 4.0";
              attribution =
                "Dados abertos da Prefeitura de Curitiba. Licenciado sob Creative Commons Attribution 4.0 International (CC-BY 4.0). Fonte: https://mid-transito.curitiba.pr.gov.br/";
            }

            radars.push({
              latitude: lat,
              longitude: lon,
              source: source,
              metadata: {
                rodovia:
                  rodoviaIndex >= 0 && columnKeys[rodoviaIndex]
                    ? getValue(columnKeys[rodoviaIndex])
                    : null,
                uf:
                  ufIndex >= 0 && columnKeys[ufIndex]
                    ? getValue(columnKeys[ufIndex])
                    : null,
                municipio:
                  municipioIndex >= 0 && columnKeys[municipioIndex]
                    ? getValue(columnKeys[municipioIndex])
                    : null,
                km: km,
                tipoRadar:
                  tipoRadarIndex >= 0 && columnKeys[tipoRadarIndex]
                    ? getValue(columnKeys[tipoRadarIndex])
                    : null,
                velocidadeLeve: velocidadeLeve,
                velocidadePesado: velocidadePesado,
                sentido:
                  sentidoIndex >= 0 && columnKeys[sentidoIndex]
                    ? getValue(columnKeys[sentidoIndex])
                    : null,
                situacao:
                  situacaoIndex >= 0 && columnKeys[situacaoIndex]
                    ? getValue(columnKeys[situacaoIndex])
                    : null,
                concessionaria:
                  concessionariaIndex >= 0 && columnKeys[concessionariaIndex]
                    ? getValue(columnKeys[concessionariaIndex])
                    : null,
                license: license,
                attribution: attribution,
              },
            });
            processedCount++;
          } else {
            skippedCount++;
            // Log apenas as primeiras 3 linhas que falharam para debug
            if (skippedCount <= 3) {
              const sampleKeys = Object.keys(row).slice(0, 5);
              console.log(
                `   ⚠️ Linha ${skippedCount} sem coordenadas válidas. Colunas: ${sampleKeys.join(
                  ", "
                )}`
              );
            }
          }
        } catch (error) {
          skippedCount++;
          continue;
        }
      }

      console.log(
        `   ✅ Processados: ${processedCount}, Ignorados: ${skippedCount}`
      );
    }

    console.log(`   📊 Total de radares extraídos: ${radars.length}`);
    return radars;
  } catch (error) {
    console.error("   ❌ Erro ao processar arquivo XLSX:", error);
    return [];
  }
}

/**
 * Buscar radares do DER-SP (Departamento de Estradas de Rodagem de São Paulo)
 * Formato: JSON disponível em dadosabertos.sp.gov.br ou XLSX
 * Licença: CC-BY 4.0 (Creative Commons Attribution 4.0 International)
 * Fonte: https://www.der.sp.gov.br/WebSite/Arquivos/DadosAbertos/
 *
 * ATRIBUIÇÃO OBRIGATÓRIA (CC-BY 4.0):
 * Dados abertos do DER-SP (Departamento de Estradas de Rodagem de São Paulo).
 * Licenciado sob Creative Commons Attribution 4.0 International (CC-BY 4.0).
 * Fonte: https://www.der.sp.gov.br/WebSite/Arquivos/DadosAbertos/
 */
export async function fetchDERSPRadars(): Promise<RadarSource[]> {
  try {
    console.log("📡 Buscando radares DER-SP...");

    // Tentar diferentes URLs e resource_ids
    const urls = [
      "https://www.der.sp.gov.br/WebSite/Arquivos/DadosAbertos/AtivosRodoviarios/Radar/radares.xlsx",
      "https://dadosabertos.sp.gov.br/api/3/action/datastore_search?resource_id=radares",
      "https://dadosabertos.sp.gov.br/dataset/radares-der-sp",
    ];

    let data: any = null;
    let isXLSX = false;
    let xlsxBuffer: ArrayBuffer | null = null;

    for (const url of urls) {
      try {
        console.log(`   Tentando URL: ${url}`);
        const response = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept: url.includes(".xlsx")
              ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream"
              : "application/json",
          },
        });

        if (response.ok) {
          const contentType = response.headers.get("content-type") || "";

          // Verificar se é arquivo XLSX
          if (
            url.includes(".xlsx") ||
            contentType.includes("spreadsheet") ||
            contentType.includes("excel") ||
            contentType.includes("octet-stream")
          ) {
            isXLSX = true;
            xlsxBuffer = await response.arrayBuffer();
            console.log(
              `   ✅ Arquivo XLSX baixado! Tamanho: ${xlsxBuffer.byteLength} bytes`
            );
            break;
          } else {
            // Tentar como JSON
            try {
              data = await response.json();
              console.log(`   ✅ Sucesso!`);
              break;
            } catch (jsonError) {
              // Se não for JSON, pode ser XLSX mesmo sem extensão
              const buffer = await response.arrayBuffer();
              if (buffer.byteLength > 0) {
                isXLSX = true;
                xlsxBuffer = buffer;
                console.log(
                  `   ✅ Arquivo detectado como XLSX! Tamanho: ${xlsxBuffer.byteLength} bytes`
                );
                break;
              }
            }
          }
        } else {
          console.log(
            `   ❌ Falhou: ${response.status} ${response.statusText}`
          );
        }
      } catch (err) {
        console.log(`   ❌ Erro na requisição: ${err}`);
        continue;
      }
    }

    // Se for XLSX, processar
    if (isXLSX && xlsxBuffer) {
      console.log("   📊 Processando arquivo XLSX...");
      const radars = await processXLSXFile(xlsxBuffer, "der-sp");
      console.log(`✅ Radares DER-SP carregados: ${radars.length}`);
      return radars;
    }

    if (!data) {
      console.warn(
        "⚠️ Não foi possível obter dados do DER-SP. Tentando buscar diretamente do portal..."
      );
      // Retornar vazio por enquanto, mas não falhar completamente
      return [];
    }

    const radars: RadarSource[] = [];

    // Estrutura pode variar, tentar diferentes formatos
    const records = data.result?.records || data.records || data.features || [];
    console.log(`   📄 Total de registros encontrados: ${records.length}`);

    for (const record of records) {
      try {
        // Tentar diferentes nomes de campos para latitude/longitude
        let lat: number | null = null;
        let lon: number | null = null;

        // Tentar campos diretos
        const latFields = ["latitude", "lat", "LATITUDE", "LAT", "_latitude"];
        const lonFields = [
          "longitude",
          "lon",
          "lng",
          "LONGITUDE",
          "LON",
          "LNG",
          "_longitude",
        ];

        for (const field of latFields) {
          if (record[field] !== undefined && record[field] !== null) {
            const val = parseFloat(record[field]);
            if (!isNaN(val) && val >= -35 && val <= 5) {
              lat = val;
              break;
            }
          }
        }

        for (const field of lonFields) {
          if (record[field] !== undefined && record[field] !== null) {
            const val = parseFloat(record[field]);
            if (!isNaN(val) && val >= -75 && val <= -30) {
              lon = val;
              break;
            }
          }
        }

        // Tentar coordenadas como string
        if ((lat === null || lon === null) && record.coordenadas) {
          const coords = record.coordenadas.split(",");
          if (coords.length >= 2) {
            const latVal = parseFloat(coords[0].trim());
            const lonVal = parseFloat(coords[1].trim());
            if (!isNaN(latVal) && !isNaN(lonVal)) {
              lat = latVal;
              lon = lonVal;
            }
          }
        }

        // Tentar formato GeoJSON
        if ((lat === null || lon === null) && record.geometry) {
          if (
            record.geometry.coordinates &&
            Array.isArray(record.geometry.coordinates)
          ) {
            if (record.geometry.type === "Point") {
              [lon, lat] = record.geometry.coordinates;
            }
          }
        }

        if (lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon)) {
          radars.push({
            latitude: lat,
            longitude: lon,
            source: "der-sp",
            metadata: {
              ...record,
              license: "CC-BY 4.0",
              attribution:
                "Dados abertos do DER-SP (Departamento de Estradas de Rodagem de São Paulo). Licenciado sob Creative Commons Attribution 4.0 International (CC-BY 4.0). Fonte: https://www.der.sp.gov.br/WebSite/Arquivos/DadosAbertos/",
            },
          });
        }
      } catch (error) {
        // Ignorar erros silenciosamente
        continue;
      }
    }

    console.log(`✅ Radares DER-SP carregados: ${radars.length}`);
    return radars;
  } catch (error) {
    console.error("❌ Erro ao buscar radares DER-SP:", error);
    return [];
  }
}

/**
 * Buscar radares do GPS Data Team
 * Formato: JSON/CSV disponível em gps-data-team.com
 */
export async function fetchGPSDataTeamRadars(): Promise<RadarSource[]> {
  try {
    console.log("📡 Buscando radares GPS Data Team...");

    // Tentar diferentes URLs (GPS Data Team pode ter mudado a estrutura)
    const urls = [
      "https://www.gps-data-team.com/poi/brazil/safety/SpeedCam-BR.json",
      "https://www.gps-data-team.com/poi/brazil/safety/SpeedCam-BR.csv",
      "https://www.gps-data-team.com/poi/brazil/safety/SpeedCam-BR.html",
    ];

    let data: any = null;
    let isCSV = false;

    // Tentar JSON primeiro
    for (const url of urls) {
      try {
        console.log(`   Tentando URL: ${url}`);
        const response = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept: "application/json, text/csv, */*",
          },
        });

        if (response.ok) {
          const contentType = response.headers.get("content-type") || "";
          if (contentType.includes("json")) {
            data = await response.json();
            console.log(`   ✅ Sucesso (JSON)!`);
            break;
          } else if (contentType.includes("csv") || url.endsWith(".csv")) {
            const csvText = await response.text();
            data = csvText;
            isCSV = true;
            console.log(
              `   ✅ Sucesso (CSV)! Tamanho: ${csvText.length} bytes`
            );
            break;
          }
        } else {
          console.log(
            `   ❌ Falhou: ${response.status} ${response.statusText}`
          );
        }
      } catch (err) {
        console.log(`   ❌ Erro na requisição: ${err}`);
        continue;
      }
    }

    if (!data) {
      console.warn("⚠️ Não foi possível obter dados do GPS Data Team");
      return [];
    }

    const radars: RadarSource[] = [];

    if (isCSV) {
      // Processar CSV
      const lines = (data as string).split("\n").filter((line) => line.trim());
      console.log(`   📄 Total de linhas CSV: ${lines.length}`);

      if (lines.length > 1) {
        const header = lines[0].toLowerCase();
        const headerCols = header
          .split(",")
          .map((col) => col.trim().replace(/^"|"$/g, ""));

        let latIndex = -1;
        let lonIndex = -1;

        for (let i = 0; i < headerCols.length; i++) {
          const col = headerCols[i];
          if (col.includes("lat") && !col.includes("lon")) {
            latIndex = i;
          }
          if (
            col.includes("lon") ||
            col.includes("lng") ||
            (col.includes("long") && !col.includes("lat"))
          ) {
            lonIndex = i;
          }
        }

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (!line.trim()) continue;

          try {
            const columns = line
              .split(",")
              .map((col) => col.trim().replace(/^"|"$/g, ""));

            let lat: number | null = null;
            let lon: number | null = null;

            if (latIndex >= 0 && latIndex < columns.length) {
              lat = parseFloat(columns[latIndex]);
            }
            if (lonIndex >= 0 && lonIndex < columns.length) {
              lon = parseFloat(columns[lonIndex]);
            }

            // Fallback: procurar em todas as colunas
            if (lat === null || lon === null || isNaN(lat) || isNaN(lon)) {
              for (const col of columns) {
                const num = parseFloat(col);
                if (!isNaN(num)) {
                  if (num >= -35 && num <= 5 && lat === null) {
                    lat = num;
                  } else if (num >= -75 && num <= -30 && lon === null) {
                    lon = num;
                  }
                }
              }
            }

            if (lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon)) {
              radars.push({
                latitude: lat,
                longitude: lon,
                source: "gps-data-team",
                metadata: { raw: columns },
              });
            }
          } catch (error) {
            continue;
          }
        }
      }
    } else {
      // Processar JSON
      const records = Array.isArray(data)
        ? data
        : data.features || data.records || [];
      console.log(`   📄 Total de registros JSON: ${records.length}`);

      for (const record of records) {
        try {
          let lat: number | null = null;
          let lon: number | null = null;

          // Tentar diferentes estruturas
          if (record.geometry?.coordinates) {
            // GeoJSON format
            [lon, lat] = record.geometry.coordinates;
          } else if (record.latitude && record.longitude) {
            lat = parseFloat(record.latitude);
            lon = parseFloat(record.longitude);
          } else if (record.lat && record.lng) {
            lat = parseFloat(record.lat);
            lon = parseFloat(record.lng);
          } else if (record.coordinates && Array.isArray(record.coordinates)) {
            [lat, lon] = record.coordinates;
          }

          if (lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon)) {
            radars.push({
              latitude: lat,
              longitude: lon,
              source: "gps-data-team",
              metadata: {
                ...record,
                license: "CC-BY 4.0",
                attribution:
                  "Dados do GPS Data Team. Licenciado sob Creative Commons Attribution 4.0 International (CC-BY 4.0). Fonte: https://www.gps-data-team.com/",
              },
            });
          }
        } catch (error) {
          continue;
        }
      }
    }

    console.log(`✅ Radares GPS Data Team carregados: ${radars.length}`);
    return radars;
  } catch (error) {
    console.error("❌ Erro ao buscar radares GPS Data Team:", error);
    return [];
  }
}

/**
 * Função auxiliar para geocodificar endereço usando OpenStreetMap Nominatim (GRATUITO)
 * Alternativa gratuita ao Mapbox - rate limit: 1 requisição por segundo
 */
async function geocodeAddress(
  address: string,
  city: string = "Curitiba, PR, Brasil"
): Promise<{ lat: number; lon: number } | null> {
  try {
    // Usar OpenStreetMap Nominatim (gratuito, mas com rate limit de 1 req/s)
    // Nominatim pode bloquear requisições muito frequentes (403)
    // Adicionar delay maior entre requisições para evitar bloqueio
    await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 segundos entre requisições

    // Combinar endereço com cidade para melhor precisão
    const query = `${address}, ${city}`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query
    )}&limit=1&countrycodes=br&addressdetails=1`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "RadarApp/1.0 (https://github.com/radar-app)", // Nominatim requer User-Agent válido
        Referer: "https://github.com/radar-app",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
    });

    if (!response.ok) {
      console.warn(`   ⚠️ Erro HTTP ${response.status} ao geocodificar`);
      return null;
    }

    const data = (await response.json()) as any[];

    if (data && data.length > 0) {
      const result = data[0];
      const lat = parseFloat(result.lat);
      const lon = parseFloat(result.lon);

      if (!isNaN(lat) && !isNaN(lon)) {
        return { lat, lon };
      }
    }

    return null;
  } catch (error) {
    console.error(`   ❌ Erro ao geocodificar "${address}":`, error);
    return null;
  }
}

/**
 * Buscar radares de Curitiba a partir de PDF
 * Fonte: https://mid-transito.curitiba.pr.gov.br/2025/5/pdf/00008310.pdf
 * Licença: CC-BY 4.0 (Creative Commons Attribution 4.0 International)
 *
 * ATRIBUIÇÃO OBRIGATÓRIA (CC-BY 4.0):
 * Dados abertos da Prefeitura de Curitiba.
 * Licenciado sob Creative Commons Attribution 4.0 International (CC-BY 4.0).
 * Fonte: https://mid-transito.curitiba.pr.gov.br/
 */
export async function fetchCuritibaRadars(): Promise<RadarSource[]> {
  try {
    console.log("📡 Buscando radares de Curitiba (PDF)...");

    const pdfUrl =
      "https://mid-transito.curitiba.pr.gov.br/2025/5/pdf/00008310.pdf";

    // Baixar PDF
    console.log(`   📥 Baixando PDF: ${pdfUrl}`);
    const response = await fetch(pdfUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`Falha ao baixar PDF: ${response.status}`);
    }

    const pdfBuffer = await response.arrayBuffer();
    console.log(`   ✅ PDF baixado: ${pdfBuffer.byteLength} bytes`);

    // Extrair texto do PDF
    console.log("   📄 Extraindo texto do PDF...");
    // Usar pdf-parse diretamente (versão 1.1.1 é mais compatível com Node.js)
    const pdfData = await pdfParse(Buffer.from(pdfBuffer));
    const text = pdfData.text;

    console.log(`   ✅ Texto extraído: ${text.length} caracteres`);

    // Debug: mostrar primeiras linhas do texto
    const previewLines = text.split("\n").slice(0, 30).join("\n");
    console.log(
      `   📋 Preview (primeiras 30 linhas):\n${previewLines.substring(
        0,
        500
      )}...`
    );

    // Processar tabelas
    const radars: RadarSource[] = [];
    const lines = text.split("\n").map((line: string) => line.trim());

    // Procurar por seções de tabelas
    let inControladores = false;
    let inRedutores = false;
    let headerFound = false;
    let processedLines = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detectar início de seção
      if (line.includes("CONTROLADORES DE VELOCIDADE")) {
        inControladores = true;
        inRedutores = false;
        headerFound = false;
        continue;
      }

      if (line.includes("REDUTORES DE VELOCIDADE")) {
        inControladores = false;
        inRedutores = true;
        headerFound = false;
        continue;
      }

      // Detectar cabeçalho da tabela
      if (
        (inControladores || inRedutores) &&
        (line.includes("SÉRIE") ||
          line.includes("IDENTIFICAÇÃO") ||
          line.includes("MARCA") ||
          line.includes("LOCAL"))
      ) {
        headerFound = true;
        continue;
      }

      // Processar linhas de dados
      // IMPORTANTE: O PDF pode ter dados quebrados em múltiplas linhas
      // Linha 1: "30011MO-17AVELSIS VSIS01"
      // Linha 2: "Av. Com. Franco, px nº 1134..."
      // Precisamos agrupar linhas consecutivas
      if (
        (inControladores || inRedutores) &&
        headerFound &&
        line &&
        line.length > 5
      ) {
        processedLines++;

        // Agrupar linha atual com próxima se necessário
        let fullLine = line;
        const nextLine = i + 1 < lines.length ? lines[i + 1] : "";

        // Se a linha atual parece ser série/identificação (começa com número e tem "VSIS" ou "MO-")
        // e a próxima linha parece ser um endereço (começa com "Av.", "R.", "BR", etc.)
        if (
          /^\d+[A-Z0-9-]*\s*[A-Z\s]*VSIS/i.test(line) &&
          /^(Av\.?|R\.?|BR|Al\.?|Rod\.?|Est\.?)/i.test(nextLine)
        ) {
          fullLine = `${line} ${nextLine}`;
          i++; // Pular próxima linha pois já foi processada
        }

        // Tentar extrair dados da linha (formato pode variar)
        // O PDF pode usar espaços múltiplos, tabs, ou pipes como separadores
        let parts: string[] = [];

        // Formato esperado: "30011   MO-17A  VELSIS VSIS01 Av. Com. Franco..."
        // Primeiro, tentar regex mais flexível que aceita diferentes formatos
        // Padrão 1: "30011MO-17AVELSIS VSIS01 Av. Com. Franco..." (sem espaços entre série e identificação)
        let match = fullLine.match(
          /^(\d+)([A-Z][A-Z0-9-]+)\s+([A-Z][A-Z\s]*?VSIS\d+|[A-Z][A-Z\s]*?PK\s+SMART|[A-Z][A-Z\s]+?)\s+(.+)$/i
        );

        if (!match) {
          // Padrão 2: "30011   MO-17A  VELSIS VSIS01 Av. Com. Franco..." (com espaços)
          match = fullLine.match(
            /^(\d+)\s+([A-Z][A-Z0-9-]+)\s+([A-Z][A-Z\s]*?VSIS\d+|[A-Z][A-Z\s]*?PK\s+SMART|[A-Z][A-Z\s]+?)\s+(.+)$/i
          );
        }

        if (match) {
          parts = match.slice(1); // [serie, identificacao, marcaModelo, local]
        } else {
          // Fallback: tentar com pipe ou múltiplos espaços
          if (fullLine.includes("|")) {
            parts = fullLine
              .split("|")
              .map((p: string) => p.trim())
              .filter((p: string) => p);
          } else {
            // Tentar com múltiplos espaços ou tabs (mínimo 2 espaços)
            parts = fullLine
              .split(/\s{2,}|\t/)
              .map((p: string) => p.trim())
              .filter((p: string) => p && p.length > 0);

            // Se ainda não tem partes suficientes, tentar com qualquer espaço
            if (parts.length < 3) {
              parts = fullLine
                .split(/\s+/)
                .map((p: string) => p.trim())
                .filter((p: string) => p && p.length > 0);
            }

            // Se parts[2] ou parts[3] contém "VSIS", pode ser que a marca/modelo esteja dividida
            if (parts.length >= 4) {
              // Se parts[2] é "VELSIS" e parts[3] contém "VSIS", juntar
              if (parts[2] === "VELSIS" && parts[3]?.match(/VSIS\d+/i)) {
                parts[2] = `${parts[2]} ${parts[3]}`;
                parts.splice(3, 1); // Remover parts[3] duplicado
              }
              // Se parts[2] não contém "VSIS" mas parts[3] contém, parts[2] pode estar incompleto
              else if (
                !parts[2]?.includes("VSIS") &&
                parts[3]?.match(/VSIS\d+/i)
              ) {
                parts[2] = `${parts[2]} ${parts[3]}`;
                parts.splice(3, 1);
              }
            }
          }
        }

        if (parts.length >= 4) {
          const serie = parts[0];
          const identificacao = parts[1];
          const marcaModelo = parts[2];

          // O local pode estar em parts[3], mas pode incluir marca/modelo se o parsing estiver errado
          // Tentar detectar onde começa o endereço real
          let local = "";
          let observacoes = "";

          // Se parts[3] contém "VSIS" ou é muito curto, pode ser marca/modelo ainda
          if (parts[3] && (parts[3].includes("VSIS") || parts[3].length < 15)) {
            // O endereço provavelmente está em parts[4] ou além
            if (parts.length > 4) {
              local = parts.slice(4).join(" "); // Juntar tudo a partir do índice 4
            } else {
              // Tentar extrair da linha original usando regex mais específica
              // Formato: "30011   MO-17A  VELSIS VSIS01 Av. Com. Franco..."
              const addressMatch = line.match(
                /^\d+\s+[A-Z0-9-]+\s+[A-Z\s]+VSIS\d+\s+(.+)$/i
              );
              if (addressMatch) {
                local = addressMatch[1];
              } else {
                // Tentar sem VSIS
                const addressMatch2 = line.match(
                  /^\d+\s+[A-Z0-9-]+\s+[A-Z\s]+\s+([A-Z][^0-9].+)$/
                );
                if (addressMatch2) {
                  local = addressMatch2[1];
                } else {
                  local = parts[3]; // Fallback
                }
              }
            }
          } else {
            local = parts[3];
            observacoes = parts.slice(4).join(" ") || "";
          }

          // Se o local ainda parece ser marca/modelo, tentar pegar o próximo campo
          if (
            local &&
            (local.includes("VSIS") ||
              local.length < 15 ||
              /^[A-Z\s]+$/.test(local))
          ) {
            if (parts.length > 4) {
              local = parts.slice(4).join(" ");
            }
          }

          // Limpar local removendo marca/modelo se ainda estiver presente
          local = local.replace(/^[A-Z\s]*VSIS[^\s]*\s*/i, "").trim();

          // Ignorar se o local parece ser uma observação (não é um endereço real)
          // Padrões comuns de observações: "Remanejado", "Início", "Localização:", "Equipamento", etc.
          const isObservation =
            /^(Remanejado|Início|Localização:|Equipamento|Última|Substituindo|Equip|SERÁ|FORA|desligado)/i.test(
              local
            );

          // Verificar se começa com endereço válido (Av., R., BR, Al., etc.)
          const isValidAddress = /^(Av\.?|R\.?|BR|Al\.?|Rod\.?|Est\.?)/i.test(
            local
          );

          if (
            local &&
            local.length > 10 &&
            !local.match(/^[A-Z\s]*VSIS/i) &&
            !isObservation &&
            isValidAddress
          ) {
            // Extrair sentido do local
            let sentido: string | null = null;
            const sentidoMatch = local.match(/SENTIDO\s+([A-Z\/\s]+)/i);
            if (sentidoMatch) {
              sentido = sentidoMatch[1].trim();
            }

            // Limpar endereço removendo informações de sentido
            let endereco = local
              .replace(/\s*-\s*SENTIDO\s+[A-Z\/\s]+/i, "")
              .replace(/\s*SENTIDO\s+[A-Z\/\s]+/i, "")
              .trim();

            // Adicionar "Curitiba, PR" se não estiver presente
            if (!endereco.toLowerCase().includes("curitiba")) {
              endereco = `${endereco}, Curitiba, PR, Brasil`;
            }

            // Geocodificar endereço
            // O delay de 2 segundos já está dentro da função geocodeAddress
            console.log(
              `   🔍 Geocodificando: ${endereco.substring(0, 60)}...`
            );
            const coords = await geocodeAddress(endereco);

            if (coords) {
              radars.push({
                latitude: coords.lat,
                longitude: coords.lon,
                source: "curitiba",
                metadata: {
                  serie: serie,
                  identificacao: identificacao,
                  marcaModelo: marcaModelo,
                  local: local,
                  observacoes: observacoes,
                  tipoRadar: inControladores
                    ? "Controlador"
                    : inRedutores
                    ? "Redutor"
                    : null,
                  sentido: sentido,
                  uf: "PR",
                  municipio: "Curitiba",
                  license: "CC-BY 4.0",
                  attribution:
                    "Dados abertos da Prefeitura de Curitiba. Licenciado sob Creative Commons Attribution 4.0 International (CC-BY 4.0). Fonte: https://mid-transito.curitiba.pr.gov.br/",
                },
              });
            } else {
              console.log(
                `   ⚠️ Não foi possível geocodificar: ${endereco.substring(
                  0,
                  60
                )}...`
              );
            }

            // Delay já aplicado antes da geocodificação
          } else if (processedLines <= 5) {
            // Debug: mostrar linhas que não foram processadas
            console.log(
              `   ⚠️ Linha não processada (${
                parts.length
              } partes): ${line.substring(0, 80)}...`
            );
          }
        } else if (processedLines <= 5 && line.length > 10) {
          // Debug: mostrar linhas que não têm partes suficientes
          console.log(
            `   ⚠️ Linha com poucas partes (${parts.length}): ${line.substring(
              0,
              80
            )}...`
          );
        }
      }
    }

    console.log(`✅ Radares de Curitiba extraídos: ${radars.length}`);
    console.log(`   📊 Linhas processadas: ${processedLines}`);
    console.log(
      `   📍 Seções encontradas: Controladores=${inControladores}, Redutores=${inRedutores}`
    );
    return radars;
  } catch (error) {
    console.error("❌ Erro ao buscar radares de Curitiba:", error);
    return [];
  }
}

/**
 * Sincronizar todos os radares das bases de dados
 */
export async function syncAllRadars(): Promise<{
  antt: number;
  derSp: number;
  gpsDataTeam: number;
  curitiba: number;
  total: number;
}> {
  console.log("🔄 Iniciando sincronização de radares...");

  // Buscar de todas as fontes (ANTT agora usa JSON único, não precisa buscar múltiplas vezes)
  const [anttRadars, derSpRadars, gpsRadars, curitibaRadars] =
    await Promise.all([
      fetchANTTRadars(), // JSON único com todos os radares
      fetchDERSPRadars(),
      fetchGPSDataTeamRadars(),
      fetchCuritibaRadars(),
    ]);

  let anttCount = 0;
  let derSpCount = 0;
  let gpsCount = 0;
  let curitibaCount = 0;

  console.log(`\n💾 Salvando radares no banco de dados...`);
  console.log(`   ANTT: ${anttRadars.length} radares para processar`);
  console.log(`   DER-SP: ${derSpRadars.length} radares para processar`);
  console.log(`   GPS Data Team: ${gpsRadars.length} radares para processar`);
  console.log(`   Curitiba: ${curitibaRadars.length} radares para processar\n`);

  // Função auxiliar para remover duplicatas baseado em coordenadas EXATAS
  function removeDuplicates(radars: RadarSource[]): RadarSource[] {
    const seen = new Map<string, RadarSource>();
    let duplicatesRemoved = 0;

    for (const radar of radars) {
      // Usar coordenadas EXATAS com precisão de 8 casas decimais (~1mm)
      const key = `${radar.latitude.toFixed(8)},${radar.longitude.toFixed(8)}`;

      if (!seen.has(key)) {
        seen.set(key, radar);
      } else {
        duplicatesRemoved++;
        // Manter o radar com mais informações
        const existing = seen.get(key)!;
        const existingFields = Object.values(existing.metadata || {}).filter(
          (v) => v !== null && v !== undefined && v !== ""
        ).length;
        const newFields = Object.values(radar.metadata || {}).filter(
          (v) => v !== null && v !== undefined && v !== ""
        ).length;

        if (newFields > existingFields) {
          seen.set(key, radar);
        }
      }
    }

    if (duplicatesRemoved > 0) {
      console.log(
        `   🔍 Removidas ${duplicatesRemoved} duplicatas de ${radars.length} radares`
      );
    }

    return Array.from(seen.values());
  }

  // Remover duplicatas de cada fonte ANTES de processar
  const uniqueAnttRadars = removeDuplicates(anttRadars);
  const uniqueDerSpRadars = removeDuplicates(derSpRadars);
  const uniqueGpsRadars = removeDuplicates(gpsRadars);
  const uniqueCuritibaRadars = removeDuplicates(curitibaRadars);

  // Inserir radares ANTT
  let anttProcessed = 0;
  for (const radar of uniqueAnttRadars) {
    try {
      // Verificar se já existe um radar com coordenadas EXATAS (precisão de 8 casas decimais)
      // Usar a mesma precisão da função removeDuplicates para garantir consistência
      const latRounded = parseFloat(radar.latitude.toFixed(8));
      const lonRounded = parseFloat(radar.longitude.toFixed(8));

      const existingRadar = await prisma.radar.findFirst({
        where: {
          latitude: latRounded,
          longitude: lonRounded,
        },
      });

      if (existingRadar) {
        // Atualizar radar existente (incluindo metadados se disponíveis)
        await prisma.radar.update({
          where: { id: existingRadar.id },
          data: {
            confirms: { increment: 1 },
            lastConfirmedAt: new Date(),
            // Atualizar metadados se estiverem disponíveis e não estiverem preenchidos
            rodovia: existingRadar.rodovia || radar.metadata?.rodovia || null,
            uf: existingRadar.uf || radar.metadata?.uf || null,
            municipio:
              existingRadar.municipio || radar.metadata?.municipio || null,
            km: existingRadar.km || radar.metadata?.km || null,
            tipoRadar:
              existingRadar.tipoRadar || radar.metadata?.tipoRadar || null,
            velocidadeLeve:
              existingRadar.velocidadeLeve ||
              radar.metadata?.velocidadeLeve ||
              null,
            velocidadePesado:
              existingRadar.velocidadePesado ||
              radar.metadata?.velocidadePesado ||
              null,
            sentido: existingRadar.sentido || radar.metadata?.sentido || null,
            situacao:
              existingRadar.situacao || radar.metadata?.situacao || null,
            concessionaria:
              existingRadar.concessionaria ||
              radar.metadata?.concessionaria ||
              null,
          },
        });
      } else {
        // Criar novo radar com metadados
        // Radares de fontes públicas começam com 11 confirmações (ativos imediatamente)
        await prisma.radar.create({
          data: {
            latitude: radar.latitude,
            longitude: radar.longitude,
            confirms: 11, // Fontes públicas são confiáveis desde o início
            denies: 0,
            lastConfirmedAt: new Date(),
            source: radar.source,
            rodovia: radar.metadata?.rodovia || null,
            uf: radar.metadata?.uf || null,
            municipio: radar.metadata?.municipio || null,
            km: radar.metadata?.km || null,
            tipoRadar: radar.metadata?.tipoRadar || null,
            velocidadeLeve: radar.metadata?.velocidadeLeve || null,
            velocidadePesado: radar.metadata?.velocidadePesado || null,
            velocidadeOriginalLeve: radar.metadata?.velocidadeLeve || null,
            velocidadeOriginalPesado: radar.metadata?.velocidadePesado || null,
            sentido: radar.metadata?.sentido || null,
            situacao: radar.metadata?.situacao || null,
            concessionaria: radar.metadata?.concessionaria || null,
            license: radar.metadata?.license || "CC-BY 4.0",
            attribution: radar.metadata?.attribution || null,
          },
        });
      }
      anttCount++;
      anttProcessed++;
      if (anttProcessed % 100 === 0) {
        console.log(
          `   📊 ANTT: ${anttProcessed}/${uniqueAnttRadars.length} processados...`
        );
      }
    } catch (error) {
      console.error("Erro ao inserir radar ANTT:", error);
      continue;
    }
  }

  if (anttRadars.length > 0) {
    console.log(`   ✅ ANTT: ${anttCount} radares salvos/atualizados`);
  }

  // Inserir radares DER-SP
  let derSpProcessed = 0;
  for (const radar of uniqueDerSpRadars) {
    try {
      // Verificar se já existe um radar com coordenadas EXATAS (precisão de 8 casas decimais)
      // Usar a mesma precisão da função removeDuplicates para garantir consistência
      const latRounded = parseFloat(radar.latitude.toFixed(8));
      const lonRounded = parseFloat(radar.longitude.toFixed(8));

      const existingRadar = await prisma.radar.findFirst({
        where: {
          latitude: latRounded,
          longitude: lonRounded,
        },
      });

      if (existingRadar) {
        // Atualizar radar existente (incluindo metadados se disponíveis)
        await prisma.radar.update({
          where: { id: existingRadar.id },
          data: {
            confirms: { increment: 1 },
            lastConfirmedAt: new Date(),
            // Atualizar metadados se estiverem disponíveis e não estiverem preenchidos
            rodovia: existingRadar.rodovia || radar.metadata?.rodovia || null,
            uf: existingRadar.uf || radar.metadata?.uf || null,
            municipio:
              existingRadar.municipio || radar.metadata?.municipio || null,
            km: existingRadar.km || radar.metadata?.km || null,
            tipoRadar:
              existingRadar.tipoRadar || radar.metadata?.tipoRadar || null,
            velocidadeLeve:
              existingRadar.velocidadeLeve ||
              radar.metadata?.velocidadeLeve ||
              null,
            velocidadePesado:
              existingRadar.velocidadePesado ||
              radar.metadata?.velocidadePesado ||
              null,
            sentido: existingRadar.sentido || radar.metadata?.sentido || null,
            situacao:
              existingRadar.situacao || radar.metadata?.situacao || null,
            concessionaria:
              existingRadar.concessionaria ||
              radar.metadata?.concessionaria ||
              null,
          },
        });
      } else {
        await prisma.radar.create({
          data: {
            latitude: radar.latitude,
            longitude: radar.longitude,
            confirms: 1,
            lastConfirmedAt: new Date(),
            source: radar.source,
            rodovia: radar.metadata?.rodovia || null,
            uf: radar.metadata?.uf || null,
            municipio: radar.metadata?.municipio || null,
            km: radar.metadata?.km || null,
            tipoRadar: radar.metadata?.tipoRadar || null,
            velocidadeLeve: radar.metadata?.velocidadeLeve || null,
            velocidadePesado: radar.metadata?.velocidadePesado || null,
            velocidadeOriginalLeve: radar.metadata?.velocidadeLeve || null,
            velocidadeOriginalPesado: radar.metadata?.velocidadePesado || null,
            sentido: radar.metadata?.sentido || null,
            situacao: radar.metadata?.situacao || null,
            concessionaria: radar.metadata?.concessionaria || null,
            license: radar.metadata?.license || "CC-BY 4.0",
            attribution: radar.metadata?.attribution || null,
          },
        });
      }
      derSpCount++;
      derSpProcessed++;
      if (derSpProcessed % 100 === 0) {
        console.log(
          `   📊 DER-SP: ${derSpProcessed}/${uniqueDerSpRadars.length} processados...`
        );
      }
    } catch (error) {
      console.error("Erro ao inserir radar DER-SP:", error);
      continue;
    }
  }

  if (uniqueDerSpRadars.length > 0) {
    console.log(
      `   ✅ DER-SP: ${derSpCount} radares salvos/atualizados (de ${
        derSpRadars.length
      } extraídos, ${
        derSpRadars.length - uniqueDerSpRadars.length
      } duplicatas removidas)`
    );
  }

  // Inserir radares GPS Data Team
  let gpsProcessed = 0;
  for (const radar of uniqueGpsRadars) {
    try {
      // Verificar se já existe um radar com coordenadas EXATAS (precisão de 8 casas decimais)
      // Usar a mesma precisão da função removeDuplicates para garantir consistência
      const latRounded = parseFloat(radar.latitude.toFixed(8));
      const lonRounded = parseFloat(radar.longitude.toFixed(8));

      const existingRadar = await prisma.radar.findFirst({
        where: {
          latitude: latRounded,
          longitude: lonRounded,
        },
      });

      if (existingRadar) {
        // Atualizar radar existente (incluindo metadados se disponíveis)
        await prisma.radar.update({
          where: { id: existingRadar.id },
          data: {
            confirms: { increment: 1 },
            lastConfirmedAt: new Date(),
            // Atualizar metadados se estiverem disponíveis e não estiverem preenchidos
            rodovia: existingRadar.rodovia || radar.metadata?.rodovia || null,
            uf: existingRadar.uf || radar.metadata?.uf || null,
            municipio:
              existingRadar.municipio || radar.metadata?.municipio || null,
            km: existingRadar.km || radar.metadata?.km || null,
            tipoRadar:
              existingRadar.tipoRadar || radar.metadata?.tipoRadar || null,
            velocidadeLeve:
              existingRadar.velocidadeLeve ||
              radar.metadata?.velocidadeLeve ||
              null,
            velocidadePesado:
              existingRadar.velocidadePesado ||
              radar.metadata?.velocidadePesado ||
              null,
            sentido: existingRadar.sentido || radar.metadata?.sentido || null,
            situacao:
              existingRadar.situacao || radar.metadata?.situacao || null,
            concessionaria:
              existingRadar.concessionaria ||
              radar.metadata?.concessionaria ||
              null,
          },
        });
      } else {
        await prisma.radar.create({
          data: {
            latitude: radar.latitude,
            longitude: radar.longitude,
            confirms: 1,
            lastConfirmedAt: new Date(),
            source: radar.source,
            rodovia: radar.metadata?.rodovia || null,
            uf: radar.metadata?.uf || null,
            municipio: radar.metadata?.municipio || null,
            km: radar.metadata?.km || null,
            tipoRadar: radar.metadata?.tipoRadar || null,
            velocidadeLeve: radar.metadata?.velocidadeLeve || null,
            velocidadePesado: radar.metadata?.velocidadePesado || null,
            velocidadeOriginalLeve: radar.metadata?.velocidadeLeve || null,
            velocidadeOriginalPesado: radar.metadata?.velocidadePesado || null,
            sentido: radar.metadata?.sentido || null,
            situacao: radar.metadata?.situacao || null,
            concessionaria: radar.metadata?.concessionaria || null,
            license: radar.metadata?.license || "CC-BY 4.0",
            attribution: radar.metadata?.attribution || null,
          },
        });
      }
      gpsCount++;
      gpsProcessed++;
      if (gpsProcessed % 100 === 0) {
        console.log(
          `   📊 GPS Data Team: ${gpsProcessed}/${uniqueGpsRadars.length} processados...`
        );
      }
    } catch (error) {
      console.error("Erro ao inserir radar GPS Data Team:", error);
      continue;
    }
  }

  if (uniqueGpsRadars.length > 0) {
    console.log(
      `   ✅ GPS Data Team: ${gpsCount} radares salvos/atualizados (de ${
        gpsRadars.length
      } extraídos, ${
        gpsRadars.length - uniqueGpsRadars.length
      } duplicatas removidas)`
    );
  }

  // Inserir radares de Curitiba
  let curitibaProcessed = 0;
  for (const radar of uniqueCuritibaRadars) {
    try {
      // Verificar se já existe um radar com coordenadas EXATAS (precisão de 8 casas decimais)
      // Usar a mesma precisão da função removeDuplicates para garantir consistência
      const latRounded = parseFloat(radar.latitude.toFixed(8));
      const lonRounded = parseFloat(radar.longitude.toFixed(8));

      const existingRadar = await prisma.radar.findFirst({
        where: {
          latitude: latRounded,
          longitude: lonRounded,
        },
      });

      if (existingRadar) {
        // Atualizar radar existente (incluindo metadados se disponíveis)
        await prisma.radar.update({
          where: { id: existingRadar.id },
          data: {
            confirms: { increment: 1 },
            lastConfirmedAt: new Date(),
            // Atualizar metadados se estiverem disponíveis e não estiverem preenchidos
            rodovia: existingRadar.rodovia || radar.metadata?.rodovia || null,
            uf: existingRadar.uf || radar.metadata?.uf || null,
            municipio:
              existingRadar.municipio || radar.metadata?.municipio || null,
            km: existingRadar.km || radar.metadata?.km || null,
            tipoRadar:
              existingRadar.tipoRadar || radar.metadata?.tipoRadar || null,
            velocidadeLeve:
              existingRadar.velocidadeLeve ||
              radar.metadata?.velocidadeLeve ||
              null,
            velocidadePesado:
              existingRadar.velocidadePesado ||
              radar.metadata?.velocidadePesado ||
              null,
            sentido: existingRadar.sentido || radar.metadata?.sentido || null,
            situacao:
              existingRadar.situacao || radar.metadata?.situacao || null,
            concessionaria:
              existingRadar.concessionaria ||
              radar.metadata?.concessionaria ||
              null,
          },
        });
      } else {
        await prisma.radar.create({
          data: {
            latitude: radar.latitude,
            longitude: radar.longitude,
            confirms: 1,
            lastConfirmedAt: new Date(),
            source: radar.source,
            rodovia: radar.metadata?.rodovia || null,
            uf: radar.metadata?.uf || null,
            municipio: radar.metadata?.municipio || null,
            km: radar.metadata?.km || null,
            tipoRadar: radar.metadata?.tipoRadar || null,
            velocidadeLeve: radar.metadata?.velocidadeLeve || null,
            velocidadePesado: radar.metadata?.velocidadePesado || null,
            velocidadeOriginalLeve: radar.metadata?.velocidadeLeve || null,
            velocidadeOriginalPesado: radar.metadata?.velocidadePesado || null,
            sentido: radar.metadata?.sentido || null,
            situacao: radar.metadata?.situacao || null,
            concessionaria: radar.metadata?.concessionaria || null,
            license: radar.metadata?.license || "CC-BY 4.0",
            attribution: radar.metadata?.attribution || null,
          },
        });
      }
      curitibaCount++;
      curitibaProcessed++;
      if (curitibaProcessed % 10 === 0) {
        console.log(
          `   📊 Curitiba: ${curitibaProcessed}/${uniqueCuritibaRadars.length} processados...`
        );
      }
    } catch (error) {
      console.error("Erro ao inserir radar Curitiba:", error);
      continue;
    }
  }

  if (uniqueCuritibaRadars.length > 0) {
    console.log(
      `   ✅ Curitiba: ${curitibaCount} radares salvos/atualizados (de ${
        curitibaRadars.length
      } extraídos, ${
        curitibaRadars.length - uniqueCuritibaRadars.length
      } duplicatas removidas)`
    );
  }

  const total = anttCount + derSpCount + gpsCount + curitibaCount;

  console.log(`✅ Sincronização concluída:`);
  console.log(`   ANTT: ${anttCount}`);
  console.log(`   DER-SP: ${derSpCount}`);
  console.log(`   GPS Data Team: ${gpsCount}`);
  console.log(`   Curitiba: ${curitibaCount}`);
  console.log(`   Total: ${total}`);

  return {
    antt: anttCount,
    derSp: derSpCount,
    gpsDataTeam: gpsCount,
    curitiba: curitibaCount,
    total,
  };
}
