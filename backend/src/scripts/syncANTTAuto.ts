/**
 * Script de sincronização automática da ANTT
 * Verifica se o JSON foi atualizado e baixa apenas se houver mudanças
 * Pode ser executado via cron job
 */

import { downloadANTTJSON } from "./importANTTFile";
import * as fs from "fs";
import * as path from "path";
import { saveRadars } from "./importANTTFile";
import { processJSONFile } from "./importANTTFile";

const ANTT_JSON_URL =
  "https://dados.antt.gov.br/dataset/79d287f4-f5ca-4385-a17c-f61f53831f17/resource/fa861690-70de-4a27-a82f-0eee74abdbc0/download/dados_dos_radares.json";

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
 * Obter informações do último sync
 */
function getLastSyncInfo(): LastSyncInfo {
  try {
    if (fs.existsSync(LAST_SYNC_FILE)) {
      const content = fs.readFileSync(LAST_SYNC_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (error) {
    console.warn("⚠️ Erro ao ler arquivo de último sync:", error);
  }

  return {
    lastModified: null,
    etag: null,
    contentHash: null,
    lastSyncDate: new Date(0).toISOString(),
    totalRadars: 0,
  };
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
    console.error("❌ Erro ao salvar informações de sync:", error);
  }
}

/**
 * Calcular hash do conteúdo JSON
 */
function calculateContentHash(jsonData: any): string {
  const jsonString = JSON.stringify(jsonData);
  // Hash simples baseado no tamanho e primeiros caracteres
  // Para um hash mais robusto, poderia usar crypto.createHash
  return `${jsonString.length}-${jsonString
    .substring(0, 100)
    .replace(/[^a-zA-Z0-9]/g, "")}`;
}

/**
 * Verificar se o JSON foi atualizado
 */
async function checkForUpdates(): Promise<{
  hasUpdate: boolean;
  lastModified: string | null;
  etag: string | null;
  contentHash: string | null;
  reason: string;
}> {
  const lastSync = getLastSyncInfo();

  try {
    console.log("🔍 Verificando atualizações no JSON da ANTT...");

    // Fazer HEAD request para verificar headers sem baixar o arquivo completo
    const headResponse = await fetch(ANTT_JSON_URL, {
      method: "HEAD",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!headResponse.ok) {
      console.error(
        `❌ Erro ao verificar atualizações: ${headResponse.status} ${headResponse.statusText}`
      );
      return {
        hasUpdate: false,
        lastModified: null,
        etag: null,
        contentHash: null,
        reason: "Erro ao verificar",
      };
    }

    const lastModified = headResponse.headers.get("last-modified");
    const etag = headResponse.headers.get("etag");

    // Verificar se last-modified mudou
    if (lastModified && lastSync.lastModified) {
      if (lastModified !== lastSync.lastModified) {
        console.log(
          `   ✅ Atualização detectada! Last-Modified mudou: ${lastSync.lastModified} → ${lastModified}`
        );
        return {
          hasUpdate: true,
          lastModified,
          etag,
          contentHash: null,
          reason: "last-modified mudou",
        };
      }
    }

    // Verificar se ETag mudou
    if (etag && lastSync.etag) {
      if (etag !== lastSync.etag) {
        console.log(
          `   ✅ Atualização detectada! ETag mudou: ${lastSync.etag} → ${etag}`
        );
        return {
          hasUpdate: true,
          lastModified,
          etag,
          contentHash: null,
          reason: "etag mudou",
        };
      }
    }

    // Se não tem last-modified ou etag, baixar e verificar hash do conteúdo
    if (!lastModified && !etag) {
      console.log(
        "   ⚠️ Servidor não retorna Last-Modified ou ETag, baixando para verificar conteúdo..."
      );
      const response = await fetch(ANTT_JSON_URL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
        },
      });

      if (response.ok) {
        const data: any = await response.json();
        const contentHash = calculateContentHash(data);

        if (contentHash !== lastSync.contentHash) {
          console.log(`   ✅ Atualização detectada! Hash do conteúdo mudou`);
          return {
            hasUpdate: true,
            lastModified: null,
            etag: null,
            contentHash,
            reason: "conteúdo mudou (hash diferente)",
          };
        }
      }
    }

    console.log("   ℹ️ Nenhuma atualização detectada");
    return {
      hasUpdate: false,
      lastModified,
      etag,
      contentHash: null,
      reason: "sem mudanças",
    };
  } catch (error) {
    console.error("❌ Erro ao verificar atualizações:", error);
    return {
      hasUpdate: false,
      lastModified: null,
      etag: null,
      contentHash: null,
      reason: `erro: ${error}`,
    };
  }
}

/**
 * Sincronizar ANTT (baixar e importar se houver atualização)
 */
async function syncANTT(): Promise<{
  success: boolean;
  hasUpdate: boolean;
  radarsProcessed: number;
  radarsCreated: number;
  radarsUpdated: number;
  message: string;
}> {
  try {
    console.log("🔄 Iniciando sincronização automática da ANTT...\n");

    // Verificar se há atualizações
    const updateCheck = await checkForUpdates();

    if (!updateCheck.hasUpdate) {
      console.log(
        `\n✅ Nenhuma atualização disponível (${updateCheck.reason})`
      );
      return {
        success: true,
        hasUpdate: false,
        radarsProcessed: 0,
        radarsCreated: 0,
        radarsUpdated: 0,
        message: `Nenhuma atualização disponível (${updateCheck.reason})`,
      };
    }

    console.log(`\n📥 Atualização detectada! Baixando JSON atualizado...\n`);

    // Baixar JSON
    const downloadedFile = await downloadANTTJSON();
    if (!downloadedFile) {
      return {
        success: false,
        hasUpdate: true,
        radarsProcessed: 0,
        radarsCreated: 0,
        radarsUpdated: 0,
        message: "Erro ao baixar JSON",
      };
    }

    // Processar JSON
    const radars = processJSONFile(downloadedFile);
    if (radars.length === 0) {
      return {
        success: false,
        hasUpdate: true,
        radarsProcessed: 0,
        radarsCreated: 0,
        radarsUpdated: 0,
        message: "Nenhum radar encontrado no JSON",
      };
    }

    console.log(`✅ ${radars.length} radares extraídos\n`);

    // Salvar no banco
    const result = await saveRadars(radars);

    // Atualizar informações de sync
    const jsonData = JSON.parse(fs.readFileSync(downloadedFile, "utf-8"));
    const contentHash = calculateContentHash(jsonData);
    const totalRadars = jsonData.radar ? jsonData.radar.length : 0;

    saveLastSyncInfo({
      lastModified: updateCheck.lastModified,
      etag: updateCheck.etag,
      contentHash: updateCheck.contentHash || contentHash,
      lastSyncDate: new Date().toISOString(),
      totalRadars,
    });

    console.log("\n✅ Sincronização concluída!");
    console.log(`📊 Estatísticas:`);
    console.log(`   - Radares processados: ${result.total}`);
    console.log(`   - Novos radares criados: ${result.created}`);
    console.log(`   - Radares atualizados: ${result.updated}`);

    return {
      success: true,
      hasUpdate: true,
      radarsProcessed: result.total,
      radarsCreated: result.created,
      radarsUpdated: result.updated,
      message: `Sincronização concluída: ${result.created} criados, ${result.updated} atualizados`,
    };
  } catch (error) {
    console.error("❌ Erro na sincronização:", error);
    return {
      success: false,
      hasUpdate: false,
      radarsProcessed: 0,
      radarsCreated: 0,
      radarsUpdated: 0,
      message: `Erro: ${error}`,
    };
  }
}

/**
 * Função principal (para uso em cron job)
 */
async function main() {
  const result = await syncANTT();

  if (result.hasUpdate && result.success) {
    console.log("\n🎉 Nova atualização importada com sucesso!");
    // Aqui você pode adicionar notificações, webhooks, etc.
  } else if (!result.hasUpdate) {
    console.log("\n✅ Sistema atualizado, nenhuma mudança detectada");
  } else {
    console.log("\n❌ Erro na sincronização");
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Erro fatal:", error);
    process.exit(1);
  });
}

export { syncANTT, checkForUpdates };
