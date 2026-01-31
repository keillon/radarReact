# Roadmap

## Implementado

- **Radares**: reportar, editar, mover, inativar, ativar.
- **Alertas em tempo real**: Socket.IO para novos/atualizados radares durante a navegação.
- **Modal de reporte**: velocidade (opcional) e tipo de radar (Reportado, Fixo, Móvel).

## Futuro (não implementado)

- **Estilo Waze**: usar a mesma lógica de reporte para **acidentes**, **trânsito**, **obras**, etc. Por ora o app trata apenas **radar**; a base (modal, API, Socket.IO) pode ser estendida depois para outros tipos de alerta.

## Notas

- **patch-package**: rode sempre na **raiz do projeto** (`RadarREact/`), não dentro de `android/`. Exemplo: `npx patch-package @pawan-pk/react-native-mapbox-navigation`. Ou use `npm run apply-patch` na raiz.
