import * as fs from "fs";
import * as path from "path";
import { prisma } from "../utils/prisma";
import type { RadarSource } from "../services/radarSources";
import * as crypto from "crypto";

// Tamanho do batch para inserções em lote (otimização de performance)
const BATCH_SIZE = 20000; // Processar 20000 radares por vez (aumentado para melhor performance)

// Arquivo para armazenar informações do último sync
const LAST_SYNC_FILE = path.join(
  process.cwd(),
  "radarsFiles",
  ".last_sync_antt.json"
);

interface LastSyncInfo {
  lastModified: string | null;
  etag: string | null;
  contentHash: string | null;
  lastSyncDate: string;
  totalRadars: number;
}

/**
 * Salvar informações do último sync
 */
function saveLastSyncInfo(info: LastSyncInfo): void {
  try {
    const dir = path.dirname(LAST_SYNC_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LAST_SYNC_FILE, JSON.stringify(info, null, 2), "utf-8");
  } catch (error) {
    console.warn("⚠️ Erro ao salvar informações de sync:", error);
  }
}

/**
 * Calcular hash do conteúdo JSON
 */
function calculateContentHash(data: any): string {
  const jsonString = JSON.stringify(data);
  return crypto.createHash("md5").update(jsonString).digest("hex");
}

/**
 * Processar arquivo CSV da ANTT
 */
function processCSVFile(filePath: string): RadarSource[] {
  console.log(`📄 Processando arquivo CSV: ${filePath}`);

  const fileContent = fs.readFileSync(filePath, "utf-8");
  const lines = fileContent.split("\n").filter((line) => line.trim());

  if (lines.length === 0) {
    console.error("❌ Arquivo CSV vazio");
    return [];
  }

  console.log(`   📊 Total de linhas: ${lines.length}`);

  // Detectar separador (ponto e vírgula ou vírgula)
  const firstLine = lines[0];
  const hasSemicolon = firstLine.includes(";");
  const separator = hasSemicolon ? ";" : ",";
  console.log(
    `   🔍 Separador detectado: ${
      separator === ";" ? "ponto e vírgula (;)" : "vírgula (,)"
    }`
  );

  // Analisar cabeçalho
  const header = lines[0].toLowerCase();
  const headerCols = header
    .split(separator)
    .map((col) => col.trim().replace(/^"|"$/g, ""));

  let latIndex = -1;
  let lonIndex = -1;
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
    if (col.includes("rodovia")) {
      rodoviaIndex = i;
    }
    if (col === "uf" || col.includes("estado")) {
      ufIndex = i;
    }
    // Detectar município (mais específico para evitar confusão com km)
    if (
      (col === "municipio" ||
        col === "município" ||
        col === "cidade" ||
        col === "city" ||
        col.includes("municipio") ||
        col.includes("município") ||
        col.includes("cidade")) &&
      !col.includes("km") &&
      !col.includes("kilometer")
    ) {
      municipioIndex = i;
      console.log(
        `   ✅ Índice de município encontrado: ${i} (coluna: "${col}")`
      );
    }
    // Detectar km (mais específico, não pegar se for município)
    if (
      (col === "km" ||
        col === "kilometer" ||
        col === "quilometro" ||
        col === "quilômetro" ||
        (col.includes("km") &&
          !col.includes("h") &&
          !col.includes("municipio"))) &&
      municipioIndex !== i
    ) {
      kmIndex = i;
      console.log(`   ✅ Índice de km encontrado: ${i} (coluna: "${col}")`);
    }
    if (col.includes("tipo") && col.includes("radar")) {
      tipoRadarIndex = i;
    }
    // Detectar coluna de velocidade leve (mais flexível)
    if (
      (col.includes("velocidade") ||
        col.includes("speed") ||
        col.includes("vel")) &&
      (col.includes("leve") ||
        col.includes("ligero") ||
        col.includes("media") ||
        col.includes("legero") ||
        col.includes("ligero") ||
        col === "velocidade_leve" ||
        col === "velocidadeleve" ||
        col === "vel_leve" ||
        col === "velocidade_veiculo_leve" ||
        col === "velocidade_veiculos_leves")
    ) {
      velocidadeLeveIndex = i;
      console.log(
        `   ✅ Índice de velocidade leve encontrado: ${i} (coluna: "${col}")`
      );
    }
    // Detectar coluna de velocidade pesado (mais flexível)
    if (
      (col.includes("velocidade") ||
        col.includes("speed") ||
        col.includes("vel")) &&
      (col.includes("pesado") ||
        col.includes("carga") ||
        col.includes("pesados") ||
        col.includes("cargas") ||
        col === "velocidade_pesado" ||
        col === "velocidadepesado" ||
        col === "vel_pesado" ||
        col === "velocidade_veiculo_pesado" ||
        col === "velocidade_veiculos_pesados")
    ) {
      velocidadePesadoIndex = i;
      console.log(
        `   ✅ Índice de velocidade pesado encontrado: ${i} (coluna: "${col}")`
      );
    }
    // Se não encontrou separado, pode ser uma coluna única de velocidade (formato: "100/080 Km/h" ou "1 21-50 KM Comercial" ou "21 - 50 KM")
    // IMPORTANTE: Detectar também "velocidad" (sem "e" no final) que é comum em dados da ANTT
    if (
      (col === "velocidade" ||
        col === "velocidad" ||
        col === "speed" ||
        col === "vel" ||
        col.includes("velocidade") ||
        col.includes("velocidad") ||
        col.includes("speed")) &&
      !col.includes("leve") &&
      !col.includes("pesado") &&
      velocidadeLeveIndex === -1 &&
      velocidadePesadoIndex === -1
    ) {
      // Esta coluna será processada depois para extrair leve e pesado
      velocidadeLeveIndex = i; // Usar como índice temporário
      velocidadePesadoIndex = i; // Mesma coluna para ambos
      console.log(
        `   ✅ Coluna única de velocidade encontrada: ${i} (coluna: "${col}") - será processada para extrair leve e pesado`
      );
    }
    if (col.includes("sentido")) {
      sentidoIndex = i;
    }
    if (col.includes("situacao") || col.includes("situa")) {
      situacaoIndex = i;
    }
    if (col.includes("concessionaria") || col.includes("concession")) {
      concessionariaIndex = i;
    }
  }

  console.log(
    `   📍 Índices encontrados - Lat: ${
      latIndex >= 0 ? latIndex : "não encontrado"
    }, Lon: ${lonIndex >= 0 ? lonIndex : "não encontrado"}, VelLeve: ${
      velocidadeLeveIndex >= 0 ? velocidadeLeveIndex : "não encontrado"
    }, VelPesado: ${
      velocidadePesadoIndex >= 0 ? velocidadePesadoIndex : "não encontrado"
    }`
  );

  // Processar linhas de dados (precisamos disso para detectar colunas quando não há cabeçalho)
  const dataLines = lines.slice(1);

  if (latIndex === -1 || lonIndex === -1) {
    console.warn(
      `   ⚠️ Não foi possível encontrar índices de lat/lon no cabeçalho`
    );
    console.log(`   📋 Cabeçalho: ${headerCols.join(", ")}`);

    // Tentar detectar lat/lon pela primeira linha de dados (quando não há cabeçalho)
    if (dataLines.length > 0) {
      console.log(
        `   🔍 Tentando detectar lat/lon pela primeira linha de dados...`
      );
      const firstDataLine = dataLines[0];
      const firstDataCols = firstDataLine
        .split(separator)
        .map((col) => col.trim().replace(/^"|"$/g, ""));

      for (let i = 0; i < firstDataCols.length; i++) {
        const val = firstDataCols[i];
        const num = parseFloat(val.replace(",", "."));

        // Detectar latitude (Brasil: -35 a 5)
        if (
          latIndex === -1 &&
          !isNaN(num) &&
          num >= -35 &&
          num <= 5 &&
          num < 0
        ) {
          latIndex = i;
          console.log(`   ✅ Latitude detectada na coluna ${i}: ${val}`);
        }

        // Detectar longitude (Brasil: -75 a -30)
        if (
          lonIndex === -1 &&
          !isNaN(num) &&
          num >= -75 &&
          num <= -30 &&
          num < 0
        ) {
          lonIndex = i;
          console.log(`   ✅ Longitude detectada na coluna ${i}: ${val}`);
        }
      }
    }
  }

  // Detectar município e km pela primeira linha de dados se não encontrou no cabeçalho
  if (municipioIndex === -1 && dataLines.length > 0) {
    console.log(
      `   🔍 Tentando detectar município pela primeira linha de dados...`
    );
    const firstDataLine = dataLines[0];
    const firstDataCols = firstDataLine
      .split(separator)
      .map((col) => col.trim().replace(/^"|"$/g, ""));

    // Priorizar colunas que parecem ser nomes de cidades (não rodovias, não códigos)
    const municipioCandidates: Array<{
      index: number;
      value: string;
      score: number;
    }> = [];

    for (let i = 0; i < firstDataCols.length; i++) {
      const val = firstDataCols[i];
      // Município geralmente é texto (não número) e não é coordenada
      if (
        i !== latIndex &&
        i !== lonIndex &&
        i !== kmIndex &&
        isNaN(parseFloat(val.replace(",", "."))) &&
        val.length > 2 &&
        val.length < 50 &&
        !val.match(/^\d+[.,]\d+$/) // Não é número decimal
      ) {
        // Verificar se parece ser um nome de cidade (tem letras)
        if (/[a-zA-Z]/.test(val) && !val.match(/^\d+[-/]\d+$/)) {
          let score = 0;

          // Penalizar se parece ser rodovia (contém "via", "br-", "rodovia", etc)
          if (
            /via\s+(sul|norte|leste|oeste)/i.test(val) ||
            /^br-?\d+/i.test(val) ||
            /^vs\d+/i.test(val) ||
            /rodovia/i.test(val) ||
            /estrada/i.test(val)
          ) {
            score -= 10; // Penalizar rodovias
          }

          // Penalizar palavras que não são nomes de cidades (sentidos, direções, etc)
          if (
            /^(principal|secundaria|secundária|sentido|crescente|decrescente|direção|direcao|norte|sul|leste|oeste)$/i.test(
              val
            ) ||
            /^(moto|carro|caminhão|caminhao|ônibus|onibus|comercial|passeio|carga|leve|pesado)$/i.test(
              val
            )
          ) {
            score -= 15; // Penalizar muito palavras que não são cidades
          }

          // Bonificar se parece ser nome de cidade (palavras comuns em nomes de cidades)
          if (
            /^(são|santa|santo|rio|porto|vila|nova|velha|ouro|preto|branco|verde|azul)$/i.test(
              val
            ) ||
            (val.split(/\s+/).length === 1 && val.length > 4 && val.length < 20) // Nome simples de cidade (4-20 caracteres)
          ) {
            score += 5;
          }

          // Bonificar ainda mais se é um nome de cidade conhecido (ex: "torres", "congonhas")
          const knownCities = [
            "torres",
            "congonhas",
            "ouro preto",
            "belo horizonte",
            "curitiba",
            "porto alegre",
            "florianópolis",
            "florianopolis",
          ];
          if (
            knownCities.some((city) =>
              val.toLowerCase().includes(city.toLowerCase())
            )
          ) {
            score += 10; // Bonificar muito se é uma cidade conhecida
          }

          // Bonificar se está perto das coordenadas (geralmente município vem antes ou depois)
          if (Math.abs(i - latIndex) <= 3 || Math.abs(i - lonIndex) <= 3) {
            score += 3;
          }

          municipioCandidates.push({ index: i, value: val, score });
        }
      }
    }

    // Escolher o candidato com maior score (ou primeiro se empate)
    if (municipioCandidates.length > 0) {
      municipioCandidates.sort((a, b) => b.score - a.score);
      const best = municipioCandidates[0];
      // Só usar se o score for positivo (não é rodovia)
      if (best.score > -5) {
        municipioIndex = best.index;
        console.log(
          `   ✅ Município detectado na coluna ${best.index}: "${best.value}" (score: ${best.score})`
        );
      } else {
        console.log(
          `   ⚠️ Candidatos de município encontrados mas parecem ser rodovias: ${municipioCandidates
            .map((c) => `coluna ${c.index}="${c.value}" (score: ${c.score})`)
            .join(", ")}`
        );
      }
    }
  }

  // Detectar km pela primeira linha de dados se não encontrou no cabeçalho
  if (kmIndex === -1 && dataLines.length > 0) {
    console.log(`   🔍 Tentando detectar km pela primeira linha de dados...`);
    const firstDataLine = dataLines[0];
    const firstDataCols = firstDataLine
      .split(separator)
      .map((col) => col.trim().replace(/^"|"$/g, ""));

    for (let i = 0; i < firstDataCols.length; i++) {
      const val = firstDataCols[i];
      // KM geralmente é um número decimal pequeno (ex: 4.700, 12.5)
      const num = parseFloat(val.replace(",", "."));
      if (
        i !== latIndex &&
        i !== lonIndex &&
        i !== municipioIndex &&
        !isNaN(num) &&
        num > 0 &&
        num < 10000 &&
        (val.includes(".") || val.includes(","))
      ) {
        kmIndex = i;
        console.log(`   ✅ KM detectado na coluna ${i}: ${val}`);
        break;
      }
    }
  }

  // Se não encontrou colunas de velocidade pelo nome, tentar detectar pelo conteúdo
  if (velocidadeLeveIndex === -1 && velocidadePesadoIndex === -1) {
    console.warn(
      `   ⚠️ Não foi possível encontrar índices de velocidade no cabeçalho`
    );
    console.log(`   📋 Cabeçalho completo: ${headerCols.join(", ")}`);
    console.log(
      `   🔍 Tentando detectar colunas de velocidade pelo conteúdo...`
    );

    // Analisar primeiras 10 linhas de dados para detectar padrões de velocidade
    const sampleLines = dataLines.slice(0, Math.min(10, dataLines.length));

    // Padrões mais específicos para velocidade (não pegar identificadores)
    // Padrões válidos:
    // - "121 - 140" (range com espaços)
    // - "21-50 KM" (range com KM)
    // - "80 km/h" (número com unidade)
    // - "100/080" (formato leve/pesado)
    // NÃO pegar:
    // - "vs101-12" (tem letras antes)
    // - "br-101" (tem letras antes)
    const velocityPatterns = [
      /^\s*(\d{2,3})\s*[-–—]\s*(\d{2,3})\s*(?:KM|km|Km|km\/h|KM\/H)?\s*$/i, // Range: "121 - 140" ou "21-50 KM"
      /^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*(?:KM|km|Km|km\/h|KM\/H)?\s*$/i, // Formato: "100/080"
      /^\s*(\d{2,3})\s*(?:KM|km|Km|km\/h|KM\/H)\s*$/i, // Número único: "80 km/h"
      /^\s*[<>=]+\s*(\d{2,3})\s*(?:KM|km|Km|km\/h|KM\/H)?\s*$/i, // Limite: "<= 20 KM"
      /^\s*(\d{1,2})\s+(\d{2,3})\s*[-–—]\s*(\d{2,3})\s*(?:KM|km|Km)?\s*/i, // "1 21-50 KM"
    ];

    for (let colIdx = 0; colIdx < headerCols.length; colIdx++) {
      let matchesVelocity = 0;
      let totalChecked = 0;
      let validRanges = 0; // Contar ranges válidos (20-200 km/h)

      for (const line of sampleLines) {
        if (!line.trim()) continue;

        try {
          // Parse CSV (considera vírgulas/ponto e vírgula dentro de aspas)
          const columns: string[] = [];
          let current = "";
          let inQuotes = false;

          for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === separator && !inQuotes) {
              columns.push(current.trim().replace(/^"|"$/g, ""));
              current = "";
            } else {
              current += char;
            }
          }
          columns.push(current.trim().replace(/^"|"$/g, ""));

          if (colIdx < columns.length) {
            const val = columns[colIdx]?.trim() || "";
            totalChecked++;

            // Ignorar valores vazios
            if (!val) continue;

            // NÃO considerar se começa com letras (ex: "vs101-12", "br-101")
            if (/^[a-zA-Z]/.test(val)) {
              continue;
            }

            // Verificar se contém padrões de velocidade válidos
            let isVelocity = false;
            for (const pattern of velocityPatterns) {
              const match = val.match(pattern);
              if (match) {
                // Verificar se os números estão no range válido de velocidade (20-200 km/h)
                const num1 = match[1] ? parseFloat(match[1]) : null;
                const num2 = match[2] ? parseFloat(match[2]) : null;
                const num3 = match[3] ? parseFloat(match[3]) : null;

                // Verificar se pelo menos um número está no range válido
                if (
                  (num1 && num1 >= 20 && num1 <= 200) ||
                  (num2 && num2 >= 20 && num2 <= 200) ||
                  (num3 && num3 >= 20 && num3 <= 200)
                ) {
                  isVelocity = true;
                  validRanges++;
                  break;
                }
              }
            }

            if (isVelocity) {
              matchesVelocity++;
            }
          }
        } catch (e) {
          // Ignorar erros de parsing
        }
      }

      // Se mais de 60% das amostras têm padrão de velocidade válido (20-200 km/h), considerar como coluna de velocidade
      if (
        totalChecked > 0 &&
        matchesVelocity / totalChecked >= 0.6 &&
        validRanges >= 3
      ) {
        velocidadeLeveIndex = colIdx;
        velocidadePesadoIndex = colIdx;
        console.log(
          `   ✅ Coluna de velocidade detectada pelo conteúdo: ${colIdx} (coluna: "${headerCols[colIdx]}") - ${matchesVelocity}/${totalChecked} amostras com padrão de velocidade válido (${validRanges} ranges válidos)`
        );
        break;
      }
    }
  }

  const radars: RadarSource[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    if (!line.trim()) continue;

    try {
      // Parse CSV (considera vírgulas/ponto e vírgula dentro de aspas)
      const columns: string[] = [];
      let current = "";
      let inQuotes = false;

      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === separator && !inQuotes) {
          columns.push(current.trim().replace(/^"|"$/g, ""));
          current = "";
        } else {
          current += char;
        }
      }
      columns.push(current.trim().replace(/^"|"$/g, ""));

      let lat: number | null = null;
      let lon: number | null = null;

      // Extrair lat/lon pelos índices
      if (latIndex >= 0 && latIndex < columns.length) {
        const latStr = columns[latIndex].replace(",", ".");
        lat = parseFloat(latStr);
      }
      if (lonIndex >= 0 && lonIndex < columns.length) {
        const lonStr = columns[lonIndex].replace(",", ".");
        lon = parseFloat(lonStr);
      }

      // Fallback: procurar em todas as colunas
      if (lat === null || lon === null || isNaN(lat) || isNaN(lon)) {
        for (const col of columns) {
          const num = parseFloat(col.replace(",", "."));
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
        const getColumn = (index: number): string | null => {
          return index >= 0 && index < columns.length ? columns[index] : null;
        };

        const parseFloatColumn = (index: number): number | null => {
          const val = getColumn(index);
          if (!val) return null;
          const num = parseFloat(val.replace(",", "."));
          return !isNaN(num) ? num : null;
        };

        /**
         * Parse velocidade de formatos variados:
         * - "80" → 80
         * - "80 km/h" → 80
         * - "80 KM/H" → 80
         * - "<= 20 KM/h" → 20
         * - "121 - 140" → 121 (primeiro número) ou média
         * - "21 - 50 KM" → 21 ou média
         * - "100/080" → 100 (leve) ou 80 (pesado) dependendo do contexto
         * - "100/080 Km/h" → 100 ou 80
         */
        const parseVelocidadeColumn = (
          index: number,
          columnName: string = ""
        ): number | null => {
          if (index < 0) {
            return null;
          }

          const val = getColumn(index);
          if (
            !val ||
            val.trim() === "" ||
            val.trim().toLowerCase() === "null" ||
            val.trim().toLowerCase() === "n/a"
          ) {
            return null;
          }

          // Remover espaços extras
          let cleaned = val.trim();
          const originalVal = cleaned;

          // Remover aspas se houver
          cleaned = cleaned.replace(/^["']|["']$/g, "");

          // NOVO: Detectar formato "1 21-50 KM Comercial" ou "2 141-160 Comercial" ou "21 - 50 KM"
          // Padrão: número inicial (opcional) + espaço + range de velocidade + "KM" (opcional) + tipo veículo (opcional)
          const complexFormatMatch = cleaned.match(
            /^(\d+\s+)?(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)\s*(?:KM|km|Km|K)?\s*(?:Comercial|Ônibus|Passeio|Carga|Leve|Pesado|Moto|Caminhão|Autocarro|Não class)?/i
          );
          if (complexFormatMatch) {
            const num1 = parseFloat(complexFormatMatch[2].replace(",", "."));
            const num2 = parseFloat(complexFormatMatch[3].replace(",", "."));
            if (!isNaN(num1) && !isNaN(num2) && num1 > 0 && num2 > 0) {
              // Calcular média do range para ter um valor mais representativo
              const avgSpeed = Math.round((num1 + num2) / 2);
              if (i < 5) {
                console.log(
                  `   ✅ ${columnName} parseado (formato complexo "N XX-YY KM Tipo"): "${originalVal}" → ${avgSpeed} (média de ${num1}-${num2})`
                );
              }
              return avgSpeed; // Retornar média do range
            }
          }

          // Remover unidades comuns (km/h, km, kmh, etc.) - mais agressivo
          cleaned = cleaned.replace(
            /\s*(km\/h|kmh|km|h|km\/H|KM\/H|KMH)\s*/gi,
            ""
          );

          // Remover tipos de veículo comuns (para não interferir no parsing)
          cleaned = cleaned.replace(
            /\s*(Comercial|Ônibus|Passeio|Carga|Leve|Pesado|Moto|Caminhão|Autocarro)\s*/gi,
            ""
          );

          // Lidar com condições (<=, >=, <, >, =)
          cleaned = cleaned.replace(/^[<>=]+\s*/g, "");

          // Remover número inicial se houver (ex: "1 21-50" → "21-50")
          cleaned = cleaned.replace(/^\d+\s+/, "");

          // Tentar extrair formato "100/080" ou "100/80" (leve/pesado)
          const slashMatch = cleaned.match(
            /(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/
          );
          if (slashMatch) {
            const num1 = parseFloat(slashMatch[1].replace(",", "."));
            const num2 = parseFloat(slashMatch[2].replace(",", "."));
            if (!isNaN(num1) && !isNaN(num2) && num1 > 0 && num2 > 0) {
              // Se for coluna única, retornar o primeiro (leve) ou segundo (pesado) baseado no nome
              if (
                columnName.includes("pesado") ||
                columnName.includes("carga")
              ) {
                if (i < 5) {
                  console.log(
                    `   ✅ ${columnName} parseado (formato X/Y, pesado): "${originalVal}" → ${num2}`
                  );
                }
                return num2;
              } else {
                if (i < 5) {
                  console.log(
                    `   ✅ ${columnName} parseado (formato X/Y, leve): "${originalVal}" → ${num1}`
                  );
                }
                return num1;
              }
            }
          }

          // Tentar extrair número único
          const singleNum = parseFloat(cleaned.replace(",", "."));
          if (!isNaN(singleNum) && singleNum > 0 && singleNum <= 200) {
            if (i < 5) {
              console.log(
                `   ✅ ${columnName} parseado: "${originalVal}" → ${singleNum}`
              );
            }
            return singleNum;
          }

          // Tentar extrair range (ex: "121 - 140", "21-50", "121–140", "21 - 50 KM", "<= 20 KM/I")
          // Melhorar regex para capturar ranges mesmo com espaços e unidades
          const rangeMatch = cleaned.match(
            /(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)/
          );
          if (rangeMatch) {
            const num1 = parseFloat(rangeMatch[1].replace(",", "."));
            const num2 = parseFloat(rangeMatch[2].replace(",", "."));
            if (!isNaN(num1) && !isNaN(num2) && num1 > 0 && num2 > 0) {
              // Calcular média do range para ter um valor mais representativo
              const avgSpeed = Math.round((num1 + num2) / 2);
              if (i < 5) {
                console.log(
                  `   ✅ ${columnName} parseado (range): "${originalVal}" → ${avgSpeed} (média de ${num1}-${num2})`
                );
              }
              // Retornar a média do range (mais representativo que o primeiro número)
              return avgSpeed;
            }
          }

          // Tentar extrair formato "<= 20" ou ">= 100" (limite máximo/mínimo)
          const limitMatch = cleaned.match(/[<>=]+\s*(\d+(?:[.,]\d+)?)/);
          if (limitMatch) {
            const num = parseFloat(limitMatch[1].replace(",", "."));
            if (!isNaN(num) && num > 0 && num <= 200) {
              if (i < 5) {
                console.log(
                  `   ✅ ${columnName} parseado (limite): "${originalVal}" → ${num}`
                );
              }
              return num;
            }
          }

          // Tentar extrair qualquer número do texto (mais agressivo)
          const numberMatch = cleaned.match(/(\d+(?:[.,]\d+)?)/);
          if (numberMatch) {
            const num = parseFloat(numberMatch[1].replace(",", "."));
            if (!isNaN(num) && num > 0 && num <= 200) {
              if (i < 5) {
                console.log(
                  `   ✅ ${columnName} parseado (número extraído): "${originalVal}" → ${num}`
                );
              }
              return num;
            }
          }

          if (i < 5) {
            console.log(
              `   ⚠️ ${columnName} não pôde ser parseado: "${originalVal}" (índice ${index})`
            );
          }
          return null;
        };

        // Extrair velocidades
        const velocidadeLeveValue =
          velocidadeLeveIndex === velocidadePesadoIndex &&
          velocidadeLeveIndex >= 0
            ? (() => {
                // Coluna única de velocidade (formato: "100/080 Km/h" ou "121 - 140")
                const val = getColumn(velocidadeLeveIndex);
                if (!val) return null;
                const slashMatch = val
                  .trim()
                  .match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
                if (slashMatch) {
                  const num1 = parseFloat(slashMatch[1].replace(",", "."));
                  if (!isNaN(num1) && num1 > 0 && num1 <= 200) {
                    if (i < 5) {
                      console.log(
                        `   ✅ velocidadeLeve parseado (coluna única, formato X/Y): "${val}" → ${num1}`
                      );
                    }
                    return num1;
                  }
                }
                // Se não tem formato X/Y, tentar parsear normalmente (ranges, etc)
                return parseVelocidadeColumn(
                  velocidadeLeveIndex,
                  "velocidadeLeve"
                );
              })()
            : parseVelocidadeColumn(velocidadeLeveIndex, "velocidadeLeve");

        const velocidadePesadoValue =
          velocidadeLeveIndex === velocidadePesadoIndex &&
          velocidadePesadoIndex >= 0
            ? (() => {
                // Coluna única de velocidade (formato: "100/080 Km/h")
                const val = getColumn(velocidadePesadoIndex);
                if (!val) return null;
                const slashMatch = val
                  .trim()
                  .match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
                if (slashMatch) {
                  const num2 = parseFloat(slashMatch[2].replace(",", "."));
                  if (!isNaN(num2) && num2 > 0 && num2 <= 200) {
                    if (i < 5) {
                      console.log(
                        `   ✅ velocidadePesado parseado (coluna única, formato X/Y): "${val}" → ${num2}`
                      );
                    }
                    return num2;
                  }
                }
                // Se não tem formato X/Y, retornar null (não tem pesado separado)
                return null;
              })()
            : parseVelocidadeColumn(velocidadePesadoIndex, "velocidadePesado");

        // Log para debug (primeiras 5 linhas)
        if (
          i < 5 &&
          (velocidadeLeveValue !== null || velocidadePesadoValue !== null)
        ) {
          console.log(
            `   📊 Linha ${
              i + 2
            }: velocidadeLeve=${velocidadeLeveValue}, velocidadePesado=${velocidadePesadoValue}`
          );
        }

        radars.push({
          latitude: lat,
          longitude: lon,
          source: "antt",
          metadata: {
            raw: columns,
            rodovia: getColumn(rodoviaIndex),
            uf: getColumn(ufIndex),
            municipio: getColumn(municipioIndex),
            km: parseFloatColumn(kmIndex),
            tipoRadar: getColumn(tipoRadarIndex),
            velocidadeLeve: velocidadeLeveValue,
            velocidadePesado: velocidadePesadoValue,
            sentido: getColumn(sentidoIndex),
            situacao: getColumn(situacaoIndex),
            concessionaria: getColumn(concessionariaIndex),
            license: "CC-BY 4.0",
            attribution:
              "Dados abertos da ANTT (Agência Nacional de Transportes Terrestres). Licenciado sob Creative Commons Attribution 4.0 International (CC-BY 4.0). Fonte: https://dados.antt.gov.br/",
          },
        });
      }
    } catch (error) {
      if (i < 5) {
        console.error(`   ⚠️ Erro ao processar linha ${i + 2}:`, error);
      }
      continue;
    }
  }

  return radars;
}

/**
 * Processar arquivo JSON da ANTT
 */
export function processJSONFile(filePath: string): RadarSource[] {
  console.log(`📄 Processando arquivo JSON: ${filePath}`);

  const fileContent = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(fileContent);

  const radars: RadarSource[] = [];

  // Formato oficial da ANTT: { "radar": [...] }
  let records: any[] = [];
  if (data.radar && Array.isArray(data.radar)) {
    records = data.radar;
    console.log(`   ✅ Formato ANTT detectado: ${records.length} radares`);
  } else if (Array.isArray(data)) {
    records = data;
    console.log(`   ✅ Array direto detectado: ${records.length} registros`);
  } else if (data.result?.records) {
    records = data.result.records;
    console.log(
      `   ✅ Formato result.records detectado: ${records.length} registros`
    );
  } else if (data.records) {
    records = data.records;
    console.log(`   ✅ Formato records detectado: ${records.length} registros`);
  } else if (data.features) {
    records = data.features;
    console.log(
      `   ✅ Formato GeoJSON features detectado: ${records.length} features`
    );
  } else if (data.data) {
    records = data.data;
    console.log(`   ✅ Formato data detectado: ${records.length} registros`);
  }

  console.log(`   📊 Total de registros encontrados: ${records.length}`);

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

      // Tentar outros formatos se não encontrou no formato ANTT
      if (lat === null || lon === null) {
        const latFields = ["lat", "LATITUDE", "LAT", "_latitude"];
      const lonFields = [
        "lon",
        "lng",
        "LONGITUDE",
        "LON",
        "LNG",
        "_longitude",
      ];

      for (const field of latFields) {
        if (record[field] !== undefined && record[field] !== null) {
          const val = parseFloat(String(record[field]).replace(",", "."));
          if (!isNaN(val) && val >= -35 && val <= 5) {
            lat = val;
            break;
          }
        }
      }

      for (const field of lonFields) {
        if (record[field] !== undefined && record[field] !== null) {
          const val = parseFloat(String(record[field]).replace(",", "."));
          if (!isNaN(val) && val >= -75 && val <= -30) {
            lon = val;
            break;
          }
          }
        }
      }

      // Tentar formato GeoJSON
      if (
        (lat === null || lon === null) &&
        record.geometry &&
        record.geometry.type === "Point"
      ) {
        if (
          record.geometry.coordinates &&
          Array.isArray(record.geometry.coordinates) &&
          record.geometry.coordinates.length >= 2
        ) {
            [lon, lat] = record.geometry.coordinates;
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

        // Log para debug (primeiras 5 linhas)
        if (i < 5) {
          console.log(
            `   📊 Radar ${i + 1}: lat=${lat}, lon=${lon}, velocidadeLeve=${
              velocidadeLeve ?? "null"
            }, km=${km ?? "null"}, municipio=${record.municipio ?? "null"}`
          );
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
      } else {
        if (i < 5) {
          console.warn(
            `   ⚠️ Radar ${
              i + 1
            } ignorado: coordenadas inválidas (lat=${lat}, lon=${lon})`
          );
        }
      }
    } catch (error) {
      if (i < 5) {
        console.error(`   ⚠️ Erro ao processar radar ${i + 1}:`, error);
      }
      continue;
    }
  }

  console.log(
    `   ✅ ${radars.length} radares válidos extraídos de ${records.length} registros`
  );

  return radars;
}

/**
 * Remover duplicatas baseado em coordenadas EXATAS (latitude/longitude)
 * Mantém apenas 1 radar por coordenada EXATA (sem tolerância)
 */
function removeDuplicates(radars: RadarSource[]): RadarSource[] {
  console.log(`\n🔍 Removendo duplicatas de ${radars.length} radares...`);

  const seen = new Map<string, RadarSource>();
  let duplicatesRemoved = 0;

  for (const radar of radars) {
    // Criar chave baseada em coordenadas EXATAS (sem arredondamento)
    // Usar precisão de 8 casas decimais (~1mm de precisão)
    const key = `${radar.latitude.toFixed(8)},${radar.longitude.toFixed(8)}`;

    if (!seen.has(key)) {
      seen.set(key, radar);
    } else {
      duplicatesRemoved++;
      // Manter o radar com mais informações (mais campos preenchidos)
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

  const uniqueRadars = Array.from(seen.values());
  console.log(`   ✅ ${duplicatesRemoved} duplicatas removidas`);
  console.log(`   ✅ ${uniqueRadars.length} radares únicos restantes`);

  if (duplicatesRemoved > 0) {
    console.log(
      `   ⚠️  ${duplicatesRemoved} radares duplicados foram removidos antes de salvar`
    );
  }

  return uniqueRadars;
}

/**
 * Salvar radares no banco de dados (ULTRA OTIMIZADO - usa batch inserts)
 */
export async function saveRadars(radars: RadarSource[]): Promise<{
  created: number;
  updated: number;
  total: number;
}> {
  // REMOVER DUPLICATAS ANTES DE SALVAR
  const uniqueRadars = removeDuplicates(radars);

  console.log(
    `\n💾 Salvando ${uniqueRadars.length} radares únicos no banco de dados...`
  );
  console.log(`   ⚡ Usando batch inserts de ${BATCH_SIZE} registros por vez`);

  let created = 0;
  let updated = 0;
  const startTime = Date.now();

  // Processar em batches - IMPORTANTE: usar uniqueRadars, não radars!
  for (
    let batchStart = 0;
    batchStart < uniqueRadars.length;
    batchStart += BATCH_SIZE
  ) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, uniqueRadars.length);
    const batch = uniqueRadars.slice(batchStart, batchEnd);
    const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(uniqueRadars.length / BATCH_SIZE);

    console.log(
      `   📦 Processando batch ${batchNum}/${totalBatches} (${
        batchStart + 1
      }-${batchEnd} de ${radars.length})...`
    );

    try {
      // Preparar dados para inserção em batch
      const insertData = batch.map((radar) => ({
        latitude: radar.latitude,
        longitude: radar.longitude,
        confirms: 11, // Fontes públicas são confiáveis
        denies: 0,
        lastConfirmedAt: new Date(),
        createdAt: new Date(),
        source: radar.source || "antt",
        rodovia: radar.metadata?.rodovia || null,
        uf: radar.metadata?.uf || null,
        municipio: radar.metadata?.municipio || null,
        km: radar.metadata?.km || null,
        tipoRadar: radar.metadata?.tipoRadar || null,
        velocidadeLeve: radar.metadata?.velocidadeLeve || null,
        velocidadePesado: radar.metadata?.velocidadePesado || null,
        velocidadeOriginalLeve: radar.metadata?.velocidadeLeve || null, // Salvar velocidade original do JSON
        velocidadeOriginalPesado: radar.metadata?.velocidadePesado || null, // Salvar velocidade original do JSON
        sentido: radar.metadata?.sentido || null,
        situacao: radar.metadata?.situacao || null,
        concessionaria: radar.metadata?.concessionaria || null,
        license: radar.metadata?.license || "CC-BY 4.0",
        attribution: radar.metadata?.attribution || null,
      }));

      // Estratégia ULTRA OTIMIZADA: usar createMany com transação única
      // MAS verificar duplicatas antes de inserir para evitar criar radares duplicados
      try {
        // Verificar quais radares já existem no banco ANTES de inserir
        // Usar coordenadas arredondadas para 8 casas decimais (mesma precisão de removeDuplicates)
        const insertDataWithRoundedCoords = insertData.map((radar) => ({
          ...radar,
          latRounded: parseFloat(radar.latitude.toFixed(8)),
          lonRounded: parseFloat(radar.longitude.toFixed(8)),
        }));

        const existingRadars = await prisma.radar.findMany({
          where: {
            OR: insertDataWithRoundedCoords.map((radar) => ({
              latitude: radar.latRounded,
              longitude: radar.lonRounded,
            })),
          },
          select: {
            latitude: true,
            longitude: true,
          },
        });

        // Criar um Set com coordenadas existentes arredondadas para busca rápida
        const existingCoords = new Set(
          existingRadars.map(
            (r) =>
              `${parseFloat(r.latitude.toFixed(8))},${parseFloat(
                r.longitude.toFixed(8)
              )}`
          )
        );

        // Filtrar apenas radares que NÃO existem no banco (usando coordenadas arredondadas)
        const newRadars = insertDataWithRoundedCoords
          .filter((radar) => {
            const coordKey = `${radar.latRounded},${radar.lonRounded}`;
            return !existingCoords.has(coordKey);
          })
          .map(({ latRounded, lonRounded, ...rest }) => ({
            ...rest,
            latitude: latRounded,
            longitude: lonRounded,
          }));

        if (newRadars.length === 0) {
          console.log(
            `   ⚠️  Todos os ${insertData.length} radares deste batch já existem no banco`
          );
          // IMPORTANTE: Mesmo que todos existam, precisamos atualizar com novas informações (velocidade, município, etc)
          console.log(
            `   🔄 Atualizando ${insertData.length} radares existentes com novas informações do JSON...`
          );

          // Atualizar cada radar existente com as informações do JSON
          for (const radarData of insertData) {
            try {
              const existing = await prisma.radar.findFirst({
                where: {
                  latitude: {
                    gte: radarData.latitude - 0.0001,
                    lte: radarData.latitude + 0.0001,
                  },
                  longitude: {
                    gte: radarData.longitude - 0.0001,
                    lte: radarData.longitude + 0.0001,
                  },
                },
              });

              if (existing) {
                const jsonHasVelocidadeLeve =
                  radarData.velocidadeLeve !== null &&
                  radarData.velocidadeLeve !== undefined;
                const jsonHasVelocidadePesado =
                  radarData.velocidadePesado !== null &&
                  radarData.velocidadePesado !== undefined;

                // IMPORTANTE: Verificar se há votos do crowdsourcing (10+ votos)
                // Se houver, NÃO sobrescrever velocidadeLeve/Pesado, apenas velocidadeOriginalLeve/Pesado
                // @ts-ignore - Prisma Client será atualizado após migration
                const votes = await (prisma as any).userRadarSpeedVote.findMany(
                  {
                    where: { radarId: existing.id },
                  }
                );

                // Contar votos por velocidade leve
                const leveVotesMap = new Map<number, number>();
                votes.forEach((v: any) => {
                  if (v.velocidadeLeve !== null) {
                    const count = leveVotesMap.get(v.velocidadeLeve) || 0;
                    leveVotesMap.set(v.velocidadeLeve, count + 1);
                  }
                });

                // Encontrar velocidade leve mais votada
                let mostVotedLeve: number | null = null;
                let maxLeveVotes = 0;
                leveVotesMap.forEach((count, velocidade) => {
                  if (count > maxLeveVotes) {
                    maxLeveVotes = count;
                    mostVotedLeve = velocidade;
                  }
                });

                // Contar votos por velocidade pesado
                const pesadoVotesMap = new Map<number, number>();
                votes.forEach((v: any) => {
                  if (v.velocidadePesado !== null) {
                    const count = pesadoVotesMap.get(v.velocidadePesado) || 0;
                    pesadoVotesMap.set(v.velocidadePesado, count + 1);
                  }
                });

                // Encontrar velocidade pesado mais votada
                let mostVotedPesado: number | null = null;
                let maxPesadoVotes = 0;
                pesadoVotesMap.forEach((count, velocidade) => {
                  if (count > maxPesadoVotes) {
                    maxPesadoVotes = count;
                    mostVotedPesado = velocidade;
                  }
                });

                // Verificar se há crowdsourcing ativo (10+ votos)
                const hasCrowdsourcingLeve = maxLeveVotes >= 10;
                const hasCrowdsourcingPesado = maxPesadoVotes >= 10;

                // Verificar se realmente há mudanças ANTES de atualizar
                // Comparar valores considerando null/undefined
                const velocidadeLeveChanged =
                  jsonHasVelocidadeLeve &&
                  radarData.velocidadeLeve !== existing.velocidadeOriginalLeve;

                const velocidadePesadoChanged =
                  jsonHasVelocidadePesado &&
                  radarData.velocidadePesado !==
                    existing.velocidadeOriginalPesado;

                const municipioChanged =
                  radarData.municipio &&
                  radarData.municipio !== existing.municipio &&
                  existing.municipio !== null &&
                  existing.municipio !== undefined &&
                  existing.municipio !== "";

                const kmChanged =
                  radarData.km !== null &&
                  radarData.km !== undefined &&
                  existing.km !== null &&
                  existing.km !== undefined &&
                  Math.abs(radarData.km - existing.km) > 0.01; // Tolerância de 0.01 km

                const rodoviaChanged =
                  radarData.rodovia &&
                  radarData.rodovia !== existing.rodovia &&
                  existing.rodovia !== null &&
                  existing.rodovia !== undefined &&
                  existing.rodovia !== "";

                const hasChanges =
                  velocidadeLeveChanged ||
                  velocidadePesadoChanged ||
                  municipioChanged ||
                  kmChanged ||
                  rodoviaChanged;

                // Se não há mudanças reais, pular atualização completamente para evitar loop
                if (!hasChanges) {
                  // Não fazer nada se não há mudanças
                  continue;
                }

                // Log para debug
                if (jsonHasVelocidadeLeve || jsonHasVelocidadePesado) {
                  console.log(
                    `   🔄 Atualizando radar ${existing.id.substring(
                      0,
                      8
                    )}...: JSON velocidadeLeve=${
                      radarData.velocidadeLeve ?? "null"
                    }, JSON velocidadePesado=${
                      radarData.velocidadePesado ?? "null"
                    }`
                  );
                  if (hasCrowdsourcingLeve || hasCrowdsourcingPesado) {
                    console.log(
                      `   ⚠️  Crowdsourcing detectado: leve=${
                        hasCrowdsourcingLeve
                          ? `${mostVotedLeve} (${maxLeveVotes} votos)`
                          : "não"
                      }, pesado=${
                        hasCrowdsourcingPesado
                          ? `${mostVotedPesado} (${maxPesadoVotes} votos)`
                          : "não"
                      } - preservando correções do crowdsourcing`
                    );
                  }
                }

                // @ts-ignore - Prisma Client será atualizado após migration
                const updateData: any = {
                  // Só incrementar confirms se realmente houver mudanças
                  confirms: { increment: 1 },
                  lastConfirmedAt: new Date(),
                };

                // ESTRATÉGIA DE PRESERVAÇÃO DO CROWDSOURCING:
                // 1. velocidadeOriginalLeve/Pesado: SEMPRE atualizado pelo JSON (valor original da fonte)
                // 2. velocidadeLeve/Pesado:
                //    - Se houver crowdsourcing (10+ votos), NÃO atualizar (preservar correção)
                //    - Se NÃO houver crowdsourcing, usar velocidade do JSON

                // Atualizar velocidade original (sempre atualizar com valor do JSON)
                if (jsonHasVelocidadeLeve) {
                  updateData.velocidadeOriginalLeve = radarData.velocidadeLeve;

                  // Só atualizar velocidadeLeve se NÃO houver crowdsourcing
                  if (!hasCrowdsourcingLeve) {
                    updateData.velocidadeLeve = radarData.velocidadeLeve;
                  } else {
                    // Preservar velocidade do crowdsourcing
                    updateData.velocidadeLeve = mostVotedLeve;
                    console.log(
                      `   ✅ Preservando velocidadeLeve do crowdsourcing: ${mostVotedLeve} (não sobrescrevendo com JSON: ${radarData.velocidadeLeve})`
                    );
                  }
                }

                if (jsonHasVelocidadePesado) {
                  updateData.velocidadeOriginalPesado =
                    radarData.velocidadePesado;

                  // Só atualizar velocidadePesado se NÃO houver crowdsourcing
                  if (!hasCrowdsourcingPesado) {
                    updateData.velocidadePesado = radarData.velocidadePesado;
                  } else {
                    // Preservar velocidade do crowdsourcing
                    updateData.velocidadePesado = mostVotedPesado;
                    console.log(
                      `   ✅ Preservando velocidadePesado do crowdsourcing: ${mostVotedPesado} (não sobrescrevendo com JSON: ${radarData.velocidadePesado})`
                    );
                  }
                }

                // Atualizar outros campos se necessário
                if (radarData.municipio && !existing.municipio) {
                  updateData.municipio = radarData.municipio;
                }
                if (radarData.km && !existing.km) {
                  updateData.km = radarData.km;
                }
                if (radarData.rodovia && !existing.rodovia) {
                  updateData.rodovia = radarData.rodovia;
                }

                await (prisma as any).radar.update({
                  where: { id: existing.id },
                  data: updateData,
                });
              }
            } catch (error) {
              // Ignorar erros individuais, continuar com os outros
              console.warn(`   ⚠️ Erro ao atualizar radar:`, error);
            }
          }

          // Não incrementar updated aqui, pois pode não ter atualizado todos
          // O contador updated será incrementado apenas quando realmente atualizar
          continue;
        }

        console.log(
          `   🔍 ${newRadars.length} radares novos de ${insertData.length} no batch`
        );

        // Usar transação para melhor performance em batches grandes
        const result = await prisma.$transaction(
          async (tx) => {
            return await tx.radar.createMany({
              data: newRadars,
            });
          },
          {
            timeout: 60000, // Timeout de 60 segundos para batches grandes
            maxWait: 30000, // Esperar até 30s por lock
          }
        );
        created += result.count;
        updated += insertData.length - newRadars.length;
        console.log(
          `   ✅ Batch insert bem-sucedido: ${
            result.count
          } novos registros inseridos, ${
            insertData.length - newRadars.length
          } já existiam`
        );

        // Se alguns foram pulados (duplicados), processar individualmente apenas esses
        if (result.count < insertData.length) {
          const skipped = insertData.length - result.count;
          console.log(
            `   ⚠️ ${skipped} registros duplicados detectados, processando individualmente...`
          );

          // Processar os que foram pulados em sub-batches menores
          const SUB_BATCH_SIZE = 50;
          for (let i = 0; i < batch.length; i++) {
            const radar = batch[i];

            try {
              // Verificar se já existe (com tolerância de coordenadas)
              const existing = await prisma.radar.findFirst({
                where: {
                  latitude: {
                    gte: radar.latitude - 0.0001,
                    lte: radar.latitude + 0.0001,
                  },
                  longitude: {
                    gte: radar.longitude - 0.0001,
                    lte: radar.longitude + 0.0001,
                  },
                },
              });

              if (existing) {
                const jsonHasVelocidadeLeve =
                  radar.metadata?.velocidadeLeve !== null &&
                  radar.metadata?.velocidadeLeve !== undefined;
                const jsonHasVelocidadePesado =
                  radar.metadata?.velocidadePesado !== null &&
                  radar.metadata?.velocidadePesado !== undefined;

                // IMPORTANTE: Verificar se há votos do crowdsourcing (10+ votos)
                // Se houver, NÃO sobrescrever velocidadeLeve/Pesado, apenas velocidadeOriginalLeve/Pesado
                // @ts-ignore - Prisma Client será atualizado após migration
                const votes = await (prisma as any).userRadarSpeedVote.findMany(
                  {
                    where: { radarId: existing.id },
                  }
                );

                // Contar votos por velocidade leve
                const leveVotesMap = new Map<number, number>();
                votes.forEach((v: any) => {
                  if (v.velocidadeLeve !== null) {
                    const count = leveVotesMap.get(v.velocidadeLeve) || 0;
                    leveVotesMap.set(v.velocidadeLeve, count + 1);
                  }
                });

                // Encontrar velocidade leve mais votada
                let mostVotedLeve: number | null = null;
                let maxLeveVotes = 0;
                leveVotesMap.forEach((count, velocidade) => {
                  if (count > maxLeveVotes) {
                    maxLeveVotes = count;
                    mostVotedLeve = velocidade;
                  }
                });

                // Contar votos por velocidade pesado
                const pesadoVotesMap = new Map<number, number>();
                votes.forEach((v: any) => {
                  if (v.velocidadePesado !== null) {
                    const count = pesadoVotesMap.get(v.velocidadePesado) || 0;
                    pesadoVotesMap.set(v.velocidadePesado, count + 1);
                  }
                });

                // Encontrar velocidade pesado mais votada
                let mostVotedPesado: number | null = null;
                let maxPesadoVotes = 0;
                pesadoVotesMap.forEach((count, velocidade) => {
                  if (count > maxPesadoVotes) {
                    maxPesadoVotes = count;
                    mostVotedPesado = velocidade;
                  }
                });

                // Verificar se há crowdsourcing ativo (10+ votos)
                const hasCrowdsourcingLeve = maxLeveVotes >= 10;
                const hasCrowdsourcingPesado = maxPesadoVotes >= 10;

                // Log para debug
                if (jsonHasVelocidadeLeve || jsonHasVelocidadePesado) {
                  console.log(
                    `   🔄 Atualizando radar ${existing.id.substring(
                      0,
                      8
                    )}...: JSON velocidadeLeve=${
                      radar.metadata?.velocidadeLeve ?? "null"
                    }, JSON velocidadePesado=${
                      radar.metadata?.velocidadePesado ?? "null"
                    }`
                  );
                  if (hasCrowdsourcingLeve || hasCrowdsourcingPesado) {
                    console.log(
                      `   ⚠️  Crowdsourcing detectado: leve=${
                        hasCrowdsourcingLeve
                          ? `${mostVotedLeve} (${maxLeveVotes} votos)`
                          : "não"
                      }, pesado=${
                        hasCrowdsourcingPesado
                          ? `${mostVotedPesado} (${maxPesadoVotes} votos)`
                          : "não"
                      } - preservando correções do crowdsourcing`
                    );
                  }
                }

                // Verificar se realmente há mudanças ANTES de atualizar
                // Comparar valores considerando null/undefined
                const velocidadeLeveChanged2 =
                  jsonHasVelocidadeLeve &&
                  radar.metadata?.velocidadeLeve !==
                    existing.velocidadeOriginalLeve;

                const velocidadePesadoChanged2 =
                  jsonHasVelocidadePesado &&
                  radar.metadata?.velocidadePesado !==
                    existing.velocidadeOriginalPesado;

                const municipioChanged2 =
                  radar.metadata?.municipio &&
                  radar.metadata?.municipio !== existing.municipio &&
                  existing.municipio !== null &&
                  existing.municipio !== undefined &&
                  existing.municipio !== "";

                const kmChanged2 =
                  radar.metadata?.km !== null &&
                  radar.metadata?.km !== undefined &&
                  existing.km !== null &&
                  existing.km !== undefined &&
                  Math.abs(radar.metadata.km - existing.km) > 0.01; // Tolerância de 0.01 km

                const rodoviaChanged2 =
                  radar.metadata?.rodovia &&
                  radar.metadata?.rodovia !== existing.rodovia &&
                  existing.rodovia !== null &&
                  existing.rodovia !== undefined &&
                  existing.rodovia !== "";

                const hasChanges2 =
                  velocidadeLeveChanged2 ||
                  velocidadePesadoChanged2 ||
                  municipioChanged2 ||
                  kmChanged2 ||
                  rodoviaChanged2;

                // Se não há mudanças reais, pular atualização completamente para evitar loop
                if (!hasChanges2) {
                  // Não fazer nada se não há mudanças
                  continue;
                }

                // @ts-ignore - Prisma Client será atualizado após migration
                const updateData: any = {
                    confirms: { increment: 1 },
                    lastConfirmedAt: new Date(),
                };

                // ESTRATÉGIA DE PRESERVAÇÃO DO CROWDSOURCING:
                // 1. velocidadeOriginalLeve/Pesado: SEMPRE atualizado pelo JSON (valor original da fonte)
                // 2. velocidadeLeve/Pesado:
                //    - Se houver crowdsourcing (10+ votos), NÃO atualizar (preservar correção)
                //    - Se NÃO houver crowdsourcing, usar velocidade do JSON

                // Atualizar velocidade original (sempre atualizar com valor do JSON)
                if (jsonHasVelocidadeLeve) {
                  updateData.velocidadeOriginalLeve =
                    radar.metadata?.velocidadeLeve;

                  // Só atualizar velocidadeLeve se NÃO houver crowdsourcing
                  if (!hasCrowdsourcingLeve) {
                    updateData.velocidadeLeve = radar.metadata?.velocidadeLeve;
                  } else {
                    // Preservar velocidade do crowdsourcing
                    updateData.velocidadeLeve = mostVotedLeve;
                    console.log(
                      `   ✅ Preservando velocidadeLeve do crowdsourcing: ${mostVotedLeve} (não sobrescrevendo com JSON: ${radar.metadata?.velocidadeLeve})`
                    );
                  }
                }

                if (jsonHasVelocidadePesado) {
                  updateData.velocidadeOriginalPesado =
                    radar.metadata?.velocidadePesado;

                  // Só atualizar velocidadePesado se NÃO houver crowdsourcing
                  if (!hasCrowdsourcingPesado) {
                    updateData.velocidadePesado =
                      radar.metadata?.velocidadePesado;
                  } else {
                    // Preservar velocidade do crowdsourcing
                    updateData.velocidadePesado = mostVotedPesado;
                    console.log(
                      `   ✅ Preservando velocidadePesado do crowdsourcing: ${mostVotedPesado} (não sobrescrevendo com JSON: ${radar.metadata?.velocidadePesado})`
                    );
                  }
                }

                await (prisma as any).radar.update({
                  where: { id: existing.id },
                  data: updateData,
                });
                updated++;
              } else {
                // Tentar criar novamente (pode ter sido pulado por outro motivo)
                try {
                  // @ts-ignore - Prisma Client será atualizado após migration
                  await (prisma as any).radar.create({
                    data: {
                      latitude: radar.latitude,
                      longitude: radar.longitude,
                      confirms: 11,
                      denies: 0,
                      lastConfirmedAt: new Date(),
                      createdAt: new Date(),
                      source: radar.source || "antt",
                      rodovia: radar.metadata?.rodovia || null,
                      uf: radar.metadata?.uf || null,
                      municipio: radar.metadata?.municipio || null,
                      km: radar.metadata?.km || null,
                      tipoRadar: radar.metadata?.tipoRadar || null,
                      velocidadeLeve: radar.metadata?.velocidadeLeve || null,
                      velocidadePesado:
                        radar.metadata?.velocidadePesado || null,
                      velocidadeOriginalLeve:
                        radar.metadata?.velocidadeLeve || null,
                      velocidadeOriginalPesado:
                        radar.metadata?.velocidadePesado || null,
                      sentido: radar.metadata?.sentido || null,
                      situacao: radar.metadata?.situacao || null,
                      concessionaria: radar.metadata?.concessionaria || null,
                      license: radar.metadata?.license || "CC-BY 4.0",
                      attribution: radar.metadata?.attribution || null,
                    },
                  });
                  created++;
                } catch (createError) {
                  // Se ainda falhar, provavelmente é duplicata - verificar novamente
                  let existing2 = await prisma.radar.findFirst({
                    where: {
                      latitude: radar.latitude,
                      longitude: radar.longitude,
                    },
                  });

                  if (!existing2) {
                    existing2 = await prisma.radar.findFirst({
                      where: {
                        latitude: {
                          gte: radar.latitude - 0.00001,
                          lte: radar.latitude + 0.00001,
                        },
                        longitude: {
                          gte: radar.longitude - 0.00001,
                          lte: radar.longitude + 0.00001,
                        },
                      },
                    });
                  }
                  if (existing2) {
                    await prisma.radar.update({
                      where: { id: existing2.id },
                      data: {
                        confirms: { increment: 1 },
                        lastConfirmedAt: new Date(),
                      },
                    });
                    updated++;
                  }
                }
              }
            } catch (err) {
              // Ignorar erros individuais e continuar
              continue;
            }

            // Log de progresso a cada 10 registros processados individualmente
            if ((i + 1) % 10 === 0) {
              console.log(
                `      Processando duplicatas: ${i + 1}/${skipped}...`
              );
            }
          }
        }
      } catch (error: any) {
        // Se createMany falhar completamente, mostrar erro e usar fallback
        console.error(
          `   ❌ Erro no batch insert: ${
            error?.message || JSON.stringify(error)
          }`
        );
        if (error?.code) console.error(`   ❌ Código do erro: ${error.code}`);
        if (error?.meta)
          console.error(`   ❌ Meta: ${JSON.stringify(error.meta)}`);
        console.warn(`   ⚠️ Usando inserção individual otimizada...`);

        // Processar em sub-batches menores
        const SUB_BATCH_SIZE = 100;
        let subBatchCreated = 0;
        let subBatchUpdated = 0;

        for (
          let subStart = 0;
          subStart < batch.length;
          subStart += SUB_BATCH_SIZE
        ) {
          const subBatch = batch.slice(subStart, subStart + SUB_BATCH_SIZE);

          // Processar sub-batch em paralelo (mas limitado)
          const promises = subBatch.map(async (radar) => {
            try {
              const existing = await prisma.radar.findFirst({
                where: {
                  latitude: {
                    gte: radar.latitude - 0.0001,
                    lte: radar.latitude + 0.0001,
                  },
                  longitude: {
                    gte: radar.longitude - 0.0001,
                    lte: radar.longitude + 0.0001,
                  },
                },
              });

              if (existing) {
                await prisma.radar.update({
                  where: { id: existing.id },
                  data: {
                    confirms: { increment: 1 },
                    lastConfirmedAt: new Date(),
                  },
                });
                subBatchUpdated++;
              } else {
                // @ts-ignore - Prisma Client será atualizado após migration
                await (prisma as any).radar.create({
                  data: {
                    latitude: radar.latitude,
                    longitude: radar.longitude,
                    confirms: 11,
                    denies: 0,
                    lastConfirmedAt: new Date(),
                    createdAt: new Date(),
                    source: radar.source || "antt",
                    rodovia: radar.metadata?.rodovia || null,
                    uf: radar.metadata?.uf || null,
                    municipio: radar.metadata?.municipio || null,
                    km: radar.metadata?.km || null,
                    tipoRadar: radar.metadata?.tipoRadar || null,
                    velocidadeLeve: radar.metadata?.velocidadeLeve || null,
                    velocidadePesado: radar.metadata?.velocidadePesado || null,
                    velocidadeOriginalLeve:
                      radar.metadata?.velocidadeLeve || null,
                    velocidadeOriginalPesado:
                      radar.metadata?.velocidadePesado || null,
                    sentido: radar.metadata?.sentido || null,
                    situacao: radar.metadata?.situacao || null,
                    concessionaria: radar.metadata?.concessionaria || null,
                    license: radar.metadata?.license || "CC-BY 4.0",
                    attribution: radar.metadata?.attribution || null,
                  },
                });
                subBatchCreated++;
              }
            } catch (err: any) {
              // Logar apenas o primeiro erro para não poluir o console
              if (subStart === 0 && subBatch.indexOf(radar) === 0) {
                console.error(
                  `   ❌ Erro ao processar radar individual: ${
                    err?.message || err
                  }`
                );
                if (err?.code) console.error(`   ❌ Código: ${err.code}`);
              }
              return;
            }
          });

          await Promise.all(promises);

          // Log de progresso a cada 10 sub-batches
          if ((subStart / SUB_BATCH_SIZE + 1) % 10 === 0) {
            console.log(
              `      Processando sub-batches: ${subStart + SUB_BATCH_SIZE}/${
                batch.length
              }... (${subBatchCreated} criados, ${subBatchUpdated} atualizados até agora)`
            );
          }
        }

        created += subBatchCreated;
        updated += subBatchUpdated;

        if (
          subBatchCreated === 0 &&
          subBatchUpdated === 0 &&
          batch.length > 0
        ) {
          console.error(
            `   ❌ ATENÇÃO: Nenhum registro foi inserido/atualizado neste batch!`
          );
          console.error(`   ❌ Verifique a conexão com o banco de dados.`);
        }
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const processed = created + updated;
      const rate =
        processed > 0
          ? ((processed / (Date.now() - startTime)) * 1000).toFixed(0)
          : "0";
      console.log(
        `   ✅ Batch ${batchNum} concluído: ${created} criados, ${updated} atualizados | Velocidade: ~${rate} radares/segundo | Tempo: ${elapsed}s`
      );
    } catch (error) {
      console.error(`   ❌ Erro ao processar batch ${batchNum}:`, error);
      // Continuar com próximo batch mesmo se este falhar
      continue;
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const avgRate =
    radars.length > 0
      ? ((radars.length / (Date.now() - startTime)) * 1000).toFixed(0)
      : "0";
  console.log(`\n✅ Salvamento concluído em ${totalTime}s`);
  console.log(`   📊 Total: ${created} criados, ${updated} atualizados`);
  console.log(`   ⚡ Velocidade média: ~${avgRate} radares/segundo`);

  return { created, updated, total: uniqueRadars.length };
}

/**
 * Processar pasta com múltiplos arquivos
 */
async function processFolder(folderPath: string): Promise<{
  totalFiles: number;
  totalRadars: number;
  totalCreated: number;
  totalUpdated: number;
  fileResults: Array<{
    file: string;
    radars: number;
    created: number;
    updated: number;
  }>;
}> {
  console.log(`📁 Processando pasta: ${folderPath}\n`);

  const files = fs.readdirSync(folderPath);
  const jsonFiles = files.filter((file) =>
      file.toLowerCase().endsWith(".json")
  );

  if (jsonFiles.length === 0) {
    console.error("❌ Nenhum arquivo JSON encontrado na pasta");
    return {
      totalFiles: 0,
      totalRadars: 0,
      totalCreated: 0,
      totalUpdated: 0,
      fileResults: [],
    };
  }

  console.log(
    `📄 Encontrados ${jsonFiles.length} arquivo(s) JSON para processar:\n`
  );
  jsonFiles.forEach((file, index) => {
    console.log(`   ${index + 1}. ${file}`);
  });
  console.log("");

  let totalRadars = 0;
  let totalCreated = 0;
  let totalUpdated = 0;
  const fileResults: Array<{
    file: string;
    radars: number;
    created: number;
    updated: number;
  }> = [];

  const overallStartTime = Date.now();

  // Processar arquivos sequencialmente (mais seguro para grandes volumes)
  // Mas otimizar o processamento interno
  for (let i = 0; i < jsonFiles.length; i++) {
    const file = jsonFiles[i];
    const filePath = path.join(folderPath, file);
    const ext = path.extname(file).toLowerCase();
    const fileStartTime = Date.now();

    console.log(
      `\n${"=".repeat(60)}\n📄 Processando arquivo ${i + 1}/${
        jsonFiles.length
      }: ${file}\n${"=".repeat(60)}`
    );

    try {
      // Processar arquivo JSON
      let radars: RadarSource[];
      const parseStartTime = Date.now();

        radars = processJSONFile(filePath);

      const parseTime = ((Date.now() - parseStartTime) / 1000).toFixed(1);
      console.log(`   ⏱️  Parsing concluído em ${parseTime}s`);

      if (radars.length === 0) {
        console.log(`⚠️  Nenhum radar encontrado em ${file}`);
        fileResults.push({
          file,
          radars: 0,
          created: 0,
          updated: 0,
        });
        continue;
      }

      console.log(`✅ ${radars.length} radares extraídos de ${file}\n`);

      // Salvar no banco (já otimizado com batches grandes)
      const result = await saveRadars(radars);

      totalRadars += result.total;
      totalCreated += result.created;
      totalUpdated += result.updated;

      const fileTime = ((Date.now() - fileStartTime) / 1000).toFixed(1);
      const fileRate =
        radars.length > 0
          ? ((radars.length / (Date.now() - fileStartTime)) * 1000).toFixed(0)
          : "0";

      fileResults.push({
        file,
        radars: result.total,
        created: result.created,
        updated: result.updated,
      });

      console.log(
        `✅ ${file} concluído em ${fileTime}s: ${result.created} criados, ${result.updated} atualizados | Velocidade: ~${fileRate} radares/segundo`
      );
    } catch (error) {
      console.error(`❌ Erro ao processar ${file}:`, error);
      fileResults.push({
        file,
        radars: 0,
        created: 0,
        updated: 0,
      });
      continue;
    }
  }

  const totalTime = ((Date.now() - overallStartTime) / 60).toFixed(1);
  console.log(`\n⏱️  Tempo total de processamento: ${totalTime} minutos`);

  return {
    totalFiles: jsonFiles.length,
    totalRadars,
    totalCreated,
    totalUpdated,
    fileResults,
  };
}

/**
 * Baixar JSON oficial da ANTT automaticamente
 */
export async function downloadANTTJSON(): Promise<string | null> {
  const jsonUrl =
    "https://dados.antt.gov.br/dataset/79d287f4-f5ca-4385-a17c-f61f53831f17/resource/fa861690-70de-4a27-a82f-0eee74abdbc0/download/dados_dos_radares.json";

  try {
    console.log("📥 Baixando JSON oficial da ANTT...");
    console.log(`   URL: ${jsonUrl}`);

    const response = await fetch(jsonUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error(
        `   ❌ Erro ao baixar: ${response.status} ${response.statusText}`
      );
      return null;
    }

    const data: any = await response.json();
    const jsonString = JSON.stringify(data);

    // Salvar em arquivo temporário
    const tempDir = path.join(process.cwd(), "radarsFiles");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFile = path.join(tempDir, "dados_dos_radares.json");
    fs.writeFileSync(tempFile, jsonString, "utf-8");

    console.log(
      `   ✅ JSON baixado e salvo: ${tempFile} (${(
        jsonString.length / 1024
      ).toFixed(2)} KB)`
    );

    // Verificar quantos radares tem
    if (data.radar && Array.isArray(data.radar)) {
      console.log(`   📊 Total de radares no JSON: ${data.radar.length}`);
    }

    return tempFile;
  } catch (error) {
    console.error("   ❌ Erro ao baixar JSON da ANTT:", error);
    return null;
  }
}

/**
 * Função principal
 */
async function main() {
  const args = process.argv.slice(2);

  // Se não forneceu caminho, baixar JSON oficial automaticamente
  if (args.length === 0) {
    console.log(
      "📥 Nenhum arquivo fornecido. Baixando JSON oficial da ANTT automaticamente...\n"
    );
    const downloadedFile = await downloadANTTJSON();

    if (!downloadedFile) {
      console.error("❌ Erro: Não foi possível baixar o JSON da ANTT");
      console.log("\n📖 Uso alternativo:");
    console.log("   npm run import:antt <caminho-do-arquivo-ou-pasta>");
    console.log("\n📝 Exemplos:");
      console.log("   # Processar um arquivo JSON:");
    console.log("   npm run import:antt ./dados_antt.json");
    console.log("");
      console.log("   # Processar uma pasta (todos os JSON):");
    console.log("   npm run import:antt ./radarsFiles");
    process.exit(1);
    }

    // Processar o arquivo baixado
    console.log("\n🔄 Processando JSON baixado...\n");
    const radars = processJSONFile(downloadedFile);

    if (radars.length === 0) {
      console.error("❌ Nenhum radar encontrado no arquivo");
      process.exit(1);
    }

    console.log(`✅ ${radars.length} radares extraídos do arquivo\n`);

    // Salvar no banco
    const result = await saveRadars(radars);

    // Atualizar informações de sync para que o app detecte a atualização
    try {
      const jsonData = JSON.parse(fs.readFileSync(downloadedFile, "utf-8"));
      const contentHash = calculateContentHash(jsonData);
      const totalRadars = jsonData.radar ? jsonData.radar.length : 0;

      // Tentar obter headers do arquivo baixado (se disponível)
      let lastModified: string | null = null;
      let etag: string | null = null;

      saveLastSyncInfo({
        lastModified,
        etag,
        contentHash,
        lastSyncDate: new Date().toISOString(),
        totalRadars,
      });

      console.log(`   💾 Informações de sync atualizadas`);
    } catch (error) {
      console.warn("   ⚠️ Erro ao atualizar informações de sync:", error);
    }

    console.log("\n✅ Importação concluída!");
    console.log(`📊 Estatísticas:`);
    console.log(`   - Radares processados: ${result.total}`);
    console.log(`   - Novos radares criados: ${result.created}`);
    console.log(`   - Radares atualizados: ${result.updated}`);
    process.exit(0);
  }

  const inputPath = args[0];

  // Verificar se é uma URL (começa com http:// ou https://)
  if (inputPath.startsWith("http://") || inputPath.startsWith("https://")) {
    console.log(`📥 Baixando JSON da URL: ${inputPath}\n`);
    const response = await fetch(inputPath);
    if (!response.ok) {
      console.error(
        `❌ Erro ao baixar: ${response.status} ${response.statusText}`
      );
      process.exit(1);
    }
    const data: any = await response.json();
    const tempDir = path.join(process.cwd(), "radarsFiles");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFile = path.join(tempDir, "dados_dos_radares_temp.json");
    fs.writeFileSync(tempFile, JSON.stringify(data), "utf-8");

    const radars = processJSONFile(tempFile);
    const result = await saveRadars(radars);

    console.log("\n✅ Importação concluída!");
    console.log(`📊 Estatísticas:`);
    console.log(`   - Radares processados: ${result.total}`);
    console.log(`   - Novos radares criados: ${result.created}`);
    console.log(`   - Radares atualizados: ${result.updated}`);
    process.exit(0);
  }

  // Verificar se caminho existe
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Erro: Caminho não encontrado: ${inputPath}`);
    process.exit(1);
  }

  const stats = fs.statSync(inputPath);
  const isDirectory = stats.isDirectory();

  console.log("🚀 Iniciando importação de radares da ANTT...");
  console.log(`📁 ${isDirectory ? "Pasta" : "Arquivo"}: ${inputPath}\n`);

  try {
    if (isDirectory) {
      // Processar pasta
      const result = await processFolder(inputPath);

      console.log("\n" + "=".repeat(60));
      console.log("✅ Importação concluída!");
      console.log("=".repeat(60));
      console.log(`📊 Estatísticas Gerais:`);
      console.log(`   - Arquivos processados: ${result.totalFiles}`);
      console.log(`   - Total de radares processados: ${result.totalRadars}`);
      console.log(`   - Novos radares criados: ${result.totalCreated}`);
      console.log(`   - Radares atualizados: ${result.totalUpdated}`);
      console.log("\n📋 Detalhes por arquivo:");
      result.fileResults.forEach((fileResult, index) => {
        console.log(
          `   ${index + 1}. ${fileResult.file}: ${fileResult.radars} radares (${
            fileResult.created
          } criados, ${fileResult.updated} atualizados)`
        );
      });
    } else {
      // Processar arquivo único
      const ext = path.extname(inputPath).toLowerCase();
      if (ext !== ".json") {
        console.error(`❌ Erro: Formato não suportado. Use apenas .json`);
        console.log(`   Arquivo fornecido: ${ext}`);
        process.exit(1);
      }

      let radars: RadarSource[];
        radars = processJSONFile(inputPath);

      if (radars.length === 0) {
        console.error("❌ Nenhum radar encontrado no arquivo");
        process.exit(1);
      }

      console.log(`✅ ${radars.length} radares extraídos do arquivo\n`);

      // Salvar no banco
      const result = await saveRadars(radars);

      // Atualizar informações de sync para que o app detecte a atualização
      try {
        const jsonData = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
        const contentHash = calculateContentHash(jsonData);
        const totalRadars = jsonData.radar ? jsonData.radar.length : 0;

        saveLastSyncInfo({
          lastModified: null,
          etag: null,
          contentHash,
          lastSyncDate: new Date().toISOString(),
          totalRadars,
        });

        console.log(`   💾 Informações de sync atualizadas`);
      } catch (error) {
        console.warn("   ⚠️ Erro ao atualizar informações de sync:", error);
      }

      console.log("\n✅ Importação concluída!");
      console.log(`📊 Estatísticas:`);
      console.log(`   - Radares processados: ${result.total}`);
      console.log(`   - Novos radares criados: ${result.created}`);
      console.log(`   - Radares atualizados: ${result.updated}`);
    }
  } catch (error) {
    console.error("❌ Erro ao importar radares:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Só executar main() se o arquivo for executado diretamente (não quando importado)
// Verifica se está sendo executado como script (não como módulo importado)
if (
  require.main === module ||
  process.argv[1]?.endsWith("importANTTFile.ts") ||
  process.argv[1]?.endsWith("importANTTFile.js")
) {
main();
}
