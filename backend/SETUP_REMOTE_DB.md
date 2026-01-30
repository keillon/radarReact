# Configurar PostgreSQL para Conexões Remotas

Este guia ajuda a configurar o PostgreSQL no servidor VPS para aceitar conexões do seu computador local.

## ⚠️ Segurança

⚠️ **ATENÇÃO**: Permitir conexões remotas ao PostgreSQL expõe o banco de dados à internet. Certifique-se de:

- Usar senhas fortes
- Configurar firewall adequadamente
- Considerar usar VPN ou SSH tunnel para maior segurança (alternativa mais segura)

## Opção 1: Configuração Automática (Recomendado)

### No Servidor VPS:

1. **Fazer upload do script de configuração:**

   ```bash
   # No seu computador local, faça upload do script
   scp backend/setup-postgres-remote.sh radar@72.60.247.18:~/setup-postgres-remote.sh

   # Ou copie o conteúdo do script e crie no servidor
   ```

2. **No servidor, executar o script:**

   ```bash
   ssh radar@72.60.247.18
   chmod +x ~/setup-postgres-remote.sh
   ~/setup-postgres-remote.sh
   ```

3. **Configurar firewall:**
   ```bash
   sudo ufw allow 5432/tcp
   sudo ufw status
   ```

## Opção 2: Configuração Manual

### Passo 1: Configurar postgresql.conf

```bash
# No servidor VPS
ssh radar@72.60.247.18

# Encontrar o arquivo de configuração
sudo find /etc -name "postgresql.conf"

# Editar (geralmente em /etc/postgresql/16/main/postgresql.conf ou similar)
sudo nano /etc/postgresql/16/main/postgresql.conf

# Procurar e alterar:
# listen_addresses = 'localhost'  →  listen_addresses = '*'
```

### Passo 2: Configurar pg_hba.conf

```bash
# Editar pg_hba.conf (mesmo diretório do postgresql.conf)
sudo nano /etc/postgresql/16/main/pg_hba.conf

# Adicionar no final do arquivo:
host    radar    radar    0.0.0.0/0    md5
```

### Passo 3: Reiniciar PostgreSQL

```bash
sudo systemctl restart postgresql
sudo systemctl status postgresql
```

### Passo 4: Configurar Firewall

```bash
# Permitir conexões na porta 5432
sudo ufw allow 5432/tcp
sudo ufw reload
sudo ufw status
```

## Opção 3: SSH Tunnel (Mais Seguro) ⭐ RECOMENDADO

Em vez de expor o PostgreSQL diretamente, use um túnel SSH:

### No seu computador local (Windows/Mac/Linux):

```bash
# Criar túnel SSH (mantenha este terminal aberto)
ssh -L 5432:localhost:5432 radar@72.60.247.18

# Em outro terminal, configure o .env:
# DATABASE_URL="postgresql://radar:SUA_SENHA@localhost:5432/radar?schema=public"
```

**Vantagens:**

- ✅ Mais seguro (banco não fica exposto na internet)
- ✅ Não precisa alterar configurações do PostgreSQL
- ✅ Criptografado via SSH

## Testar Conexão

### Do seu computador local:

```bash
# Instalar PostgreSQL client (se não tiver)
# Windows (choco): choco install postgresql
# Mac: brew install postgresql
# Linux: sudo apt install postgresql-client

# Testar conexão
psql -h 72.60.247.18 -U radar -d radar
# Ou se usar SSH tunnel:
psql -h localhost -U radar -d radar
```

## Configurar .env Local

No arquivo `backend/.env` do seu computador:

```env
# Conexão direta (após configurar servidor)
DATABASE_URL="postgresql://radar:SUA_SENHA_AQUI@72.60.247.18:5432/radar?schema=public"

# OU usando SSH tunnel (mais seguro)
DATABASE_URL="postgresql://radar:SUA_SENHA_AQUI@localhost:5432/radar?schema=public"

PORT=3000
```

## Troubleshooting

### Erro: "Connection refused"

- Verifique se PostgreSQL está rodando: `sudo systemctl status postgresql`
- Verifique firewall: `sudo ufw status`
- Verifique se está escutando: `sudo netstat -tlnp | grep 5432`

### Erro: "Password authentication failed"

- Verifique a senha do usuário: `sudo -u postgres psql -c "ALTER USER radar WITH PASSWORD 'nova_senha';"`

### Erro: "Database does not exist"

- Crie o banco: `sudo -u postgres psql -c "CREATE DATABASE radar;"`

### Verificar logs do PostgreSQL:

```bash
sudo tail -f /var/log/postgresql/postgresql-16-main.log
```

## Reverter Configurações (Se Necessário)

Se quiser reverter as mudanças:

```bash
# Restaurar backups
sudo cp /etc/postgresql/16/main/postgresql.conf.backup.* /etc/postgresql/16/main/postgresql.conf
sudo cp /etc/postgresql/16/main/pg_hba.conf.backup.* /etc/postgresql/16/main/pg_hba.conf

# Reiniciar
sudo systemctl restart postgresql

# Bloquear firewall
sudo ufw deny 5432/tcp
```
