import { syncAllRadars } from "../services/radarSources";

async function main() {
  console.log("🚀 Iniciando sincronização de radares...");
  console.log("⏳ Isso pode levar alguns minutos...\n");

  try {
    const result = await syncAllRadars();

    console.log("\n✅ Sincronização concluída!");
    console.log(`📊 Estatísticas:`);
    console.log(`   - ANTT: ${result.antt} radares`);
    console.log(`   - DER-SP: ${result.derSp} radares`);
    console.log(`   - GPS Data Team: ${result.gpsDataTeam} radares`);
    console.log(`   - Total: ${result.total} radares`);
  } catch (error) {
    console.error("❌ Erro ao sincronizar radares:", error);
    process.exit(1);
  }
}

main();

