// Script simples para testar conexão com PostgreSQL
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testConnection() {
  try {
    console.log('🔍 Testando conexão com PostgreSQL...');
    console.log('📋 DATABASE_URL:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@') || 'NÃO CONFIGURADO');
    
    // Testar conexão básica
    await prisma.$connect();
    console.log('✅ Conexão estabelecida com sucesso!');
    
    // Testar query simples
    const count = await prisma.radar.count();
    console.log(`📊 Total de radares no banco: ${count}`);
    
    // Testar uma query mais complexa
    const sample = await prisma.radar.findFirst();
    if (sample) {
      console.log('✅ Query de exemplo funcionando!');
      console.log(`   Radar de exemplo: ID ${sample.id}, Lat: ${sample.latitude}, Lon: ${sample.longitude}`);
    }
    
    console.log('\n🎉 Conexão testada com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao conectar:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   🔴 Erro: Conexão recusada. Verifique:');
      console.error('      - Firewall está permitindo porta 5432?');
      console.error('      - PostgreSQL está rodando?');
      console.error('      - IP/Senha estão corretos?');
    } else if (error.code === 'P1001') {
      console.error('   🔴 Erro: Não foi possível alcançar o servidor. Verifique:');
      console.error('      - DATABASE_URL está correto?');
      console.error('      - Servidor está acessível?');
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();

