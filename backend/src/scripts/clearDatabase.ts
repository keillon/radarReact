import { prisma } from "../utils/prisma";

/**
 * Script para limpar TODOS os radares do banco de dados
 * ⚠️ ATENÇÃO: Esta operação é IRREVERSÍVEL!
 * Use apenas para testes ou quando quiser recomeçar do zero
 */
async function clearDatabase() {
  console.log("⚠️  ATENÇÃO: Você está prestes a DELETAR TODOS os radares do banco de dados!");
  console.log("⚠️  Esta operação é IRREVERSÍVEL!");
  console.log("");

  // Contar quantos radares existem
  const totalRadars = await prisma.radar.count();
  console.log(`📊 Total de radares no banco: ${totalRadars}`);

  if (totalRadars === 0) {
    console.log("✅ Banco de dados já está vazio!");
    await prisma.$disconnect();
    return;
  }

  console.log("");
  console.log("🔄 Deletando todos os radares...");

  try {
    // Deletar todos os radares
    const result = await prisma.radar.deleteMany({});
    
    console.log(`✅ ${result.count} radares deletados com sucesso!`);
    console.log("");
    console.log("✅ Banco de dados limpo! Agora você pode executar os scripts de extração novamente.");
  } catch (error) {
    console.error("❌ Erro ao limpar banco de dados:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar apenas se chamado diretamente
if (require.main === module) {
  clearDatabase()
    .then(() => {
      console.log("✅ Script concluído!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Erro fatal:", error);
      process.exit(1);
    });
}

export { clearDatabase };

