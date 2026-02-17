# Admin Radares — Painel Web

Ferramenta admin em **web** para gerenciar radares: ver no mapa, adicionar, mover, editar limite, deletar e inativar.

## Requisitos

- Node 18+
- API de radares (mesma do app mobile)
- Token Mapbox para o mapa

## Configuração

1. Copie o arquivo de exemplo e preencha:

```bash
cp .env.example .env
```

2. No `.env`:

- `VITE_API_URL`: URL da API (ex.: `http://72.60.247.18:3000`)
- `VITE_MAPBOX_TOKEN`: token Mapbox (crie em https://account.mapbox.com/access-tokens/)

## Instalação e execução

```bash
cd admin
npm install
npm run dev
```

O script `prepare` copia ícones de `../assets/images/` para `public/icons/` (radarMovel, radarSemaforico, placa20–160). Abre em **http://localhost:5174**.

## Build para produção

```bash
npm run build
```

A pasta `dist/` pode ser publicada em qualquer servidor estático (Netlify, Vercel, etc.).

## Funcionalidades

- **Mapa**: carrega radares em um raio de 50 km em torno do centro (São Paulo por padrão).
- **Adicionar**: botão "+ Adicionar radar" → clique no mapa → informe limite (opcional) → Salvar.
- **Editar**: clique em um radar no mapa → painel à direita com:
  - **Salvar limite**: altera o limite em km/h (PATCH `/radars/:id`).
  - **Mover**: clique no mapa na nova posição (PATCH com lat/lng).
  - **Deletar**: remove o radar (DELETE `/radars/:id`).
  - **Inativar**: marca como inativo (PATCH com `situacao: "inativo"`).
- **Recarregar**: atualiza a lista de radares da região.

Se o backend ainda não tiver PATCH/DELETE em `/radars/:id`, o painel avisa e continua permitindo adicionar (POST `/radars/report`) e recarregar.
