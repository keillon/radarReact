# Backend Radar

O código do backend (package.json, src/, prisma/, etc.) deve ficar nesta pasta.

**Se esta pasta só tem `.env` e este README:** copie do projeto antigo para cá:

- `package.json`
- `package-lock.json`
- `src/` (ou onde estiver o código)
- `prisma/` (se usar Prisma)
- `tsconfig.json`
- Outros arquivos de código (não copie `node_modules` nem `.env`)

Depois, na raiz do RadarREact:

```bash
git add backend/
git status   # conferir que aparece backend/package.json, backend/src/..., etc.
git commit -m "Backend: adicionar código ao repositório"
git push origin main
```

O `.env` não é commitado (está no .gitignore). No servidor, crie/ajuste o `.env` manualmente.
