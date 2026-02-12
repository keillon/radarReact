# Lógica de Alerta de Radar na Rota

## Objetivo

Alertar **somente** radares que estão **na mesma via** em que o usuário está navegando (linha da rota Mapbox), e **apenas um radar** por vez (o mais próximo à frente), mesmo que existam vários na região.

## Problemas que foram corrigidos

1. **Radares fora da rota**: `isRadarOnRoute` recebia o objeto errado (`RouteResponse` em vez de `route`) e a checagem de geometria falhava, aceitando qualquer radar. Além disso, a distância perpendicular permitida era 30m, incluindo ruas paralelas.
2. **Múltiplos radares**: Em vias largas (ex.: 4 faixas), mais de um radar era considerado porque 30m abrangia a via inteira e ruas paralelas.
3. **Troca de radar instável**: O “mais próximo” podia alternar entre dois radares a cada atualização (GPS), gerando vários alertas.

## Soluções implementadas

### 1. Critério “na rota” (mesma via)

- **Constante**: `MAX_ROUTE_DISTANCE_METERS = 6` (6 metros perpendicular à linha da rota).
- **Uso**: Um radar só é considerado se a distância perpendicular dele até a polilinha da rota for ≤ 6 m. Assim, só entram radares na mesma faixa/rua; ruas paralelas ou pistas opostas ficam de fora.
- **Implementação**:
  - `isRadarOnRoute(radar, routeDataRef.current?.route, routePoints)` agora recebe o objeto da rota com `geometry` (não o `RouteResponse` inteiro) e usa `calculateDistanceToRoute` em metros.
  - O filtro em `checkRadarDistance` usa a mesma constante: `routeDistMeters > MAX_ROUTE_DISTANCE_METERS` → ignorar.

### 2. Um único radar ativo (histerese)

- **Ref**: `activeRadarIdRef` guarda o id do radar que está sendo mostrado/alertado.
- **Regra**: Enquanto esse radar não for “passado” e ainda estiver na janela (0–500 m à frente), não trocamos para outro radar, mesmo que outro candidato fique ligeiramente mais próximo por ruído de GPS.
- **Troca**: Só mudamos para outro radar quando:
  - o radar ativo foi passado (`passedRadarIds`), ou
  - ele sai da janela (não aparece mais na lista de candidatos).
- **Candidatos**: Todos os radares que passam nos filtros (na rota, à frente, 0–500 m) são colocados em uma lista, ordenados por distância ao longo da rota; a histerese escolhe qual deles é o “ativo”.

### 3. Limpeza ao sair da navegação

- Ao iniciar nova navegação ou cancelar, `activeRadarIdRef`, `passedRadarIds` e `alertedRadarIds` são limpos para não carregar estado da viagem anterior.

## Como testar

1. **Radares só na rota**
   - Trace uma rota em uma avenida que tenha uma rua paralela próxima com radar.
   - Verifique que não há alerta para o radar da rua paralela; apenas para radares na via em que você está.

2. **Um radar por vez**
   - Em uma via com vários radares (ex.: mesma avenida com 2+ radares à frente), confira que só um é mostrado no modal e só um é anunciado por TTS (o mais próximo à frente).
   - Após passar esse radar, o próximo deve aparecer sem “piscar” entre dois.

3. **Não alertar radares longe**
   - Radares a mais de 500 m à frente não devem ser considerados; radares já passados não devem re-alertar.

4. **Nova viagem**
   - Após cancelar a navegação e traçar outra rota, os alertas devem começar do zero (sem radares “passados” da rota anterior).

## Arquivos alterados

- `screens/Home.tsx`:
  - `MAX_ROUTE_DISTANCE_METERS`, `isRadarOnRoute` (assinatura e uso de `route` + `routePoints`, critério em metros).
  - `checkRadarDistance`: filtro por 6 m, coleta de candidatos, ordenação e histerese com `activeRadarIdRef`.
  - Limpeza de `activeRadarIdRef` ao iniciar/cancelar navegação e quando não há radar próximo.
  - Remoção da função não usada `getDistanceFromLine`.
