#!/bin/bash

# Script para configurar PostgreSQL para aceitar conexões remotas
# Execute este script no servidor VPS

echo "🔧 Configurando PostgreSQL para aceitar conexões remotas..."

# 1. Encontrar o arquivo postgresql.conf
POSTGRES_CONF=$(sudo find /etc -name "postgresql.conf" 2>/dev/null | head -n 1)

if [ -z "$POSTGRES_CONF" ]; then
    # Tentar versões específicas do PostgreSQL
    if [ -f "/etc/postgresql/16/main/postgresql.conf" ]; then
        POSTGRES_CONF="/etc/postgresql/16/main/postgresql.conf"
    elif [ -f "/etc/postgresql/15/main/postgresql.conf" ]; then
        POSTGRES_CONF="/etc/postgresql/15/main/postgresql.conf"
    elif [ -f "/etc/postgresql/14/main/postgresql.conf" ]; then
        POSTGRES_CONF="/etc/postgresql/14/main/postgresql.conf"
    elif [ -f "/etc/postgresql/13/main/postgresql.conf" ]; then
        POSTGRES_CONF="/etc/postgresql/13/main/postgresql.conf"
    else
        echo "❌ Arquivo postgresql.conf não encontrado!"
        echo "📋 Por favor, encontre manualmente: sudo find /etc -name postgresql.conf"
        exit 1
    fi
fi

echo "✅ PostgreSQL conf encontrado: $POSTGRES_CONF"

# 2. Backup do arquivo original
echo "📦 Fazendo backup do postgresql.conf..."
sudo cp "$POSTGRES_CONF" "${POSTGRES_CONF}.backup.$(date +%Y%m%d_%H%M%S)"

# 3. Configurar listen_addresses
echo "🔧 Configurando listen_addresses..."
sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" "$POSTGRES_CONF"
sudo sed -i "s/listen_addresses = 'localhost'/listen_addresses = '*'/" "$POSTGRES_CONF"

# 4. Verificar se já está configurado
if grep -q "listen_addresses = '*'" "$POSTGRES_CONF"; then
    echo "✅ listen_addresses já configurado para aceitar todas as conexões"
else
    # Adicionar se não existir
    echo "listen_addresses = '*'" | sudo tee -a "$POSTGRES_CONF" > /dev/null
    echo "✅ listen_addresses adicionado"
fi

# 5. Encontrar pg_hba.conf
PG_HBA_CONF=$(dirname "$POSTGRES_CONF")/pg_hba.conf

if [ ! -f "$PG_HBA_CONF" ]; then
    echo "❌ Arquivo pg_hba.conf não encontrado em $(dirname "$POSTGRES_CONF")"
    echo "📋 Tentando encontrar manualmente..."
    PG_HBA_CONF=$(sudo find /etc -name "pg_hba.conf" 2>/dev/null | head -n 1)
fi

if [ -z "$PG_HBA_CONF" ] || [ ! -f "$PG_HBA_CONF" ]; then
    echo "❌ Arquivo pg_hba.conf não encontrado!"
    exit 1
fi

echo "✅ pg_hba.conf encontrado: $PG_HBA_CONF"

# 6. Backup do pg_hba.conf
echo "📦 Fazendo backup do pg_hba.conf..."
sudo cp "$PG_HBA_CONF" "${PG_HBA_CONF}.backup.$(date +%Y%m%d_%H%M%S)"

# 7. Adicionar regra para aceitar conexões do usuário radar
echo "🔧 Configurando pg_hba.conf..."
echo ""
echo "📝 Adicionando regra para aceitar conexões do usuário 'radar'..."
echo ""

# Verificar se já existe uma regra para o usuário radar
if grep -q "host.*radar.*radar" "$PG_HBA_CONF"; then
    echo "⚠️  Regra já existe para o usuário radar"
else
    # Adicionar regra no final do arquivo
    echo "# Permitir conexões remotas do usuário radar (adicionado por script)" | sudo tee -a "$PG_HBA_CONF" > /dev/null
    echo "host    radar    radar    0.0.0.0/0               md5" | sudo tee -a "$PG_HBA_CONF" > /dev/null
    echo "✅ Regra adicionada ao pg_hba.conf"
fi

# 8. Reiniciar PostgreSQL
echo ""
echo "🔄 Reiniciando PostgreSQL..."
sudo systemctl restart postgresql

if [ $? -eq 0 ]; then
    echo "✅ PostgreSQL reiniciado com sucesso"
else
    echo "❌ Erro ao reiniciar PostgreSQL"
    echo "📋 Verifique os logs: sudo journalctl -u postgresql -n 50"
    exit 1
fi

# 9. Verificar status
echo ""
echo "🔍 Verificando status do PostgreSQL..."
sudo systemctl status postgresql --no-pager -l | head -n 10

# 10. Verificar se está escutando na porta 5432
echo ""
echo "🔍 Verificando se PostgreSQL está escutando na porta 5432..."
sudo netstat -tlnp | grep 5432 || sudo ss -tlnp | grep 5432

echo ""
echo "✅ Configuração concluída!"
echo ""
echo "📋 Próximos passos:"
echo "1. Configure o firewall para permitir conexões na porta 5432:"
echo "   sudo ufw allow 5432/tcp"
echo ""
echo "2. Teste a conexão do seu computador local:"
echo "   psql -h 72.60.247.18 -U radar -d radar"
echo ""
echo "3. Configure o .env local com:"
echo "   DATABASE_URL=\"postgresql://radar:SUA_SENHA@72.60.247.18:5432/radar?schema=public\""

