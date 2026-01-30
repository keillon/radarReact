# Script de Importação de Arquivos ANTT

Este script permite importar radares da ANTT a partir de arquivos CSV ou JSON locais.

## Como Usar

### 1. Preparar o arquivo

Coloque o arquivo CSV ou JSON da ANTT em qualquer local acessível.

### 2. Executar o script

```bash
cd backend
npm run import:antt <caminho-do-arquivo>
```

### Exemplos

**Windows:**

```bash
npm run import:antt C:\Users\Keillon\Desktop\dados_antt.csv
npm run import:antt .\radarsFiles\dados_antt.csv
npm run import:antt ..\dados_antt.json
```

**Linux/Mac:**

```bash
npm run import:antt ~/Downloads/dados_antt.csv
npm run import:antt ./radarsFiles/dados_antt.csv
npm run import:antt ../dados_antt.json
```

## O que o script faz

### Processamento de arquivo único:

1. **Detecta o formato** do arquivo (CSV ou JSON)
2. **Analisa o cabeçalho** para encontrar colunas automaticamente:
   - Latitude/Longitude
   - Rodovia
   - UF (Estado)
   - Município
   - KM
   - Tipo de Radar
   - Velocidade (Leve/Pesado)
   - Sentido
   - Situação
   - Concessionária
3. **Processa todas as linhas** e extrai os dados
4. **Salva no banco de dados** com deduplicação:
   - Se o radar já existe (mesma localização), atualiza
   - Se é novo, cria um novo registro
5. **Mostra estatísticas** da importação

### Processamento de pasta:

1. **Lista todos os arquivos** CSV e JSON na pasta
2. **Processa cada arquivo sequencialmente** usando a mesma lógica acima
3. **Mostra progresso** de cada arquivo
4. **Exibe estatísticas detalhadas** por arquivo e totais gerais

## Formato esperado

### CSV

- Separador: vírgula (`,`) ou ponto e vírgula (`;`)
- Encoding: UTF-8
- Cabeçalho na primeira linha
- Colunas de latitude e longitude obrigatórias

### JSON

- Formato: Array de objetos ou objeto com propriedade `records`, `data`, `features`
- Cada objeto deve ter campos `latitude`/`lat` e `longitude`/`lon`

## Exemplo de saída

### Processando um arquivo único:

```
🚀 Iniciando importação de radares da ANTT...
📁 Arquivo: ./dados_antt.csv

📄 Processando arquivo CSV: ./dados_antt.csv
   📊 Total de linhas: 1500
   🔍 Separador detectado: ponto e vírgula (;)
   📍 Índices encontrados - Lat: 11, Lon: 12
✅ 1445 radares extraídos do arquivo

💾 Salvando 1445 radares no banco de dados...
   📊 Processados: 100/1445...
   📊 Processados: 200/1445...
   ...

✅ Importação concluída!
📊 Estatísticas:
   - Radares processados: 1445
   - Novos radares criados: 1200
   - Radares atualizados: 245
```

### Processando uma pasta:

```
🚀 Iniciando importação de radares da ANTT...
📁 Pasta: ./radarsFiles

📁 Processando pasta: ./radarsFiles

📄 Encontrados 5 arquivo(s) para processar:

   1. volume-radar-aco.csv
   2. volume-radar-af.csv
   3. volume-radar-novadutra.csv
   4. volume-radar-trans.csv
   5. volume-radar-viamineira.csv

============================================================
📄 Processando arquivo 1/5: volume-radar-aco.csv
============================================================
📄 Processando arquivo CSV: ./radarsFiles/volume-radar-aco.csv
   📊 Total de linhas: 500
   🔍 Separador detectado: ponto e vírgula (;)
   📍 Índices encontrados - Lat: 11, Lon: 12
✅ 485 radares extraídos do arquivo

💾 Salvando 485 radares no banco de dados...
   📊 Processados: 100/485...
   ...

✅ volume-radar-aco.csv concluído: 400 criados, 85 atualizados

[... processamento dos outros arquivos ...]

============================================================
✅ Importação concluída!
============================================================
📊 Estatísticas Gerais:
   - Arquivos processados: 5
   - Total de radares processados: 2450
   - Novos radares criados: 2000
   - Radares atualizados: 450

📋 Detalhes por arquivo:
   1. volume-radar-aco.csv: 485 radares (400 criados, 85 atualizados)
   2. volume-radar-af.csv: 520 radares (450 criados, 70 atualizados)
   3. volume-radar-novadutra.csv: 480 radares (380 criados, 100 atualizados)
   4. volume-radar-trans.csv: 510 radares (420 criados, 90 atualizados)
   5. volume-radar-viamineira.csv: 455 radares (350 criados, 105 atualizados)
```

## Notas

- O script detecta automaticamente o separador do CSV
- Converte vírgulas para pontos em números (formato brasileiro)
- Valida coordenadas (latitude: -35 a 5, longitude: -75 a -30)
- Radares duplicados são atualizados ao invés de criados novamente
- Todos os radares importados recebem licença CC-BY 4.0 e atribuição

## Troubleshooting

### Erro: "Arquivo não encontrado"

- Verifique se o caminho está correto
- Use caminho absoluto ou relativo ao diretório `backend`

### Erro: "Formato não suportado"

- Use apenas arquivos `.csv` ou `.json`

### Erro: "Nenhum radar encontrado"

- Verifique se o arquivo tem dados válidos
- Verifique se as colunas de latitude/longitude existem
- Verifique o encoding do arquivo (deve ser UTF-8)
