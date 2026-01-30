# Integração com Bases de Dados de Radares

Este projeto integra bases de dados públicas de radares do Brasil, todas licenciadas sob **Creative Commons Attribution 4.0 International (CC-BY 4.0)**.

## Fontes de Dados

1. **ANTT** (Agência Nacional de Transportes Terrestres)

   - URL: https://dados.antt.gov.br/dataset/radar
   - Formato: CSV
   - **Licença:** CC-BY 4.0
   - **Atribuição:** Dados abertos da ANTT (Agência Nacional de Transportes Terrestres). Licenciado sob Creative Commons Attribution 4.0 International (CC-BY 4.0). Fonte: https://dados.antt.gov.br/

2. **DER-SP** (Departamento de Estradas de Rodagem de São Paulo)

   - URL: https://www.der.sp.gov.br/WebSite/Arquivos/DadosAbertos/
   - Formato: XLSX/JSON
   - **Licença:** CC-BY 4.0
   - **Atribuição:** Dados abertos do DER-SP (Departamento de Estradas de Rodagem de São Paulo). Licenciado sob Creative Commons Attribution 4.0 International (CC-BY 4.0). Fonte: https://www.der.sp.gov.br/WebSite/Arquivos/DadosAbertos/

3. **GPS Data Team**

   - URL: https://www.gps-data-team.com/poi/brazil/safety/SpeedCam-BR.html
   - Formato: JSON/CSV
   - **Licença:** CC-BY 4.0

4. **Prefeitura de Curitiba**
   - URL: https://mid-transito.curitiba.pr.gov.br/
   - Formato: PDF
   - **Licença:** CC-BY 4.0
   - **Atribuição:** Dados abertos da Prefeitura de Curitiba. Licenciado sob Creative Commons Attribution 4.0 International (CC-BY 4.0). Fonte: https://mid-transito.curitiba.pr.gov.br/

## Licença Creative Commons Attribution 4.0 (CC-BY 4.0)

Todos os dados utilizados neste projeto são licenciados sob a [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/).

### O que isso significa?

Você é livre para:

- **Compartilhar** — copiar e redistribuir o material em qualquer suporte ou formato
- **Adaptar** — remixar, transformar e criar a partir do material para qualquer fim, mesmo comercial

Sob as seguintes condições:

- **Atribuição** — Você deve dar o crédito apropriado, fornecer um link para a licença e indicar se foram feitas alterações

### Atribuição Adequada

Ao usar os dados deste projeto, você deve incluir a atribuição apropriada conforme especificado nos metadados de cada radar. As informações de licença e atribuição estão armazenadas nos campos `license` e `attribution` de cada registro no banco de dados.

## Como Sincronizar

### Opção 1: Via Script (Recomendado)

Execute o script de sincronização:

```bash
cd backend
npm run sync:radars
```

Este script irá:

- Buscar radares de todas as três fontes
- Processar e normalizar os dados
- Inserir/atualizar no banco de dados MongoDB
- Exibir estatísticas da sincronização

### Opção 2: Via API Endpoint

Faça uma requisição POST para o endpoint:

```bash
curl -X POST http://localhost:3000/radars/sync
```

Resposta:

```json
{
  "success": true,
  "message": "Sincronização concluída com sucesso",
  "antt": 1234,
  "derSp": 567,
  "gpsDataTeam": 890,
  "total": 2691
}
```

## Como Funciona

1. **Busca de Dados**: O sistema busca dados de cada fonte em paralelo
2. **Processamento**: Os dados são processados e normalizados (coordenadas, formato)
3. **Deduplicação**: Radares próximos (mesma localização com tolerância de 0.0001 graus) são agrupados
4. **Armazenamento**: Radares são inseridos ou atualizados no banco de dados

## Estrutura dos Dados

Cada radar armazenado contém:

- `latitude`: Latitude do radar
- `longitude`: Longitude do radar
- `confirms`: Número de confirmações (incrementado quando encontrado em múltiplas fontes)
- `lastConfirmedAt`: Data da última confirmação
- `createdAt`: Data de criação

## Notas Importantes

- A sincronização pode levar alguns minutos dependendo do tamanho das bases de dados
- Radares duplicados (mesma localização) são agrupados e o contador de confirmações é incrementado
- A primeira sincronização pode demorar mais, sincronizações subsequentes são mais rápidas
- Recomenda-se executar a sincronização periodicamente (ex: diariamente) para manter os dados atualizados

## Troubleshooting

### Erro ao buscar dados de uma fonte

Se uma fonte específica falhar, o sistema continuará processando as outras fontes. Verifique:

- Conexão com a internet
- URLs das APIs ainda estão válidas
- Formato dos dados não mudou

### Radares não aparecem no app

Verifique:

- Se a sincronização foi executada com sucesso
- Se os radares estão dentro do raio de busca do app
- Se o filtro de `lastConfirmedAt` não está muito restritivo (padrão: últimas 24 horas)
