# RadarBot

Aplicativo React Native para exibição de radares (speed cameras) em mapas usando Mapbox, com clustering automático, busca de rotas e sistema de alertas.

## Funcionalidades

- 🗺️ Mapa em tela cheia usando Mapbox
- 📍 Exibição de radares no mapa como marcadores
- 🔄 Clustering automático de radares quando o zoom diminui
- 🛣️ Busca de rota entre dois pontos usando Mapbox Directions API
- 📏 Desenho da rota no mapa (polyline)
- 🔌 Integração com backend REST para buscar radares próximos da rota
- ⚠️ Sistema de alerta quando o usuário se aproxima de um radar

## Estrutura do Projeto

```
RadarBot/
├── components/
│   └── Map.tsx          # Componente do mapa com clustering e rota
├── screens/
│   └── Home.tsx         # Tela principal com busca de rota e alertas
├── services/
│   ├── mapbox.ts        # Serviço para integração com Mapbox Directions API
│   └── api.ts           # Serviço para integração com backend REST
├── android/             # Configurações Android
├── ios/                 # Configurações iOS
└── App.tsx              # Componente raiz
```

## Instalação

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar Mapbox

#### Android

1. Adicione seu token secreto do Mapbox no arquivo `android/gradle.properties`:

```properties
MAPBOX_DOWNLOADS_TOKEN=seu_token_secreto_aqui
```

2. Adicione seu token público no arquivo `android/app/src/main/res/values/mapbox_access_token.xml`:

```xml
<string name="mapbox_access_token">seu_token_publico_aqui</string>
```

3. Atualize o token no código TypeScript em `services/mapbox.ts`:

```typescript
export const MAPBOX_TOKEN = "seu_token_publico_aqui";
```

#### iOS

1. Crie um arquivo `.netrc` na raiz do seu sistema (ou na pasta home) com:

```
machine api.mapbox.com
login mapbox
password seu_token_secreto_aqui
```

2. Adicione o token público no arquivo `ios/RadarBot/Info.plist` na chave `MBXAccessToken`.

3. Atualize o token no código TypeScript em `services/mapbox.ts`.

### 3. Configurar Backend API

Atualize a URL do backend no arquivo `services/api.ts`:

```typescript
const API_BASE_URL = "https://sua-api-url.com/api";
```

O backend deve ter um endpoint `POST /radars/near-route` que recebe:

```json
{
  "route": [
    { "latitude": -23.5505, "longitude": -46.6333 },
    { "latitude": -23.5515, "longitude": -46.6343 }
  ],
  "radius": 100
}
```

E retorna:

```json
{
  "radars": [
    {
      "id": "1",
      "latitude": -23.5505,
      "longitude": -46.6333,
      "speedLimit": 60,
      "type": "fixed"
    }
  ]
}
```

### 4. Executar o projeto

#### Android

1. **Inicie o Metro bundler** (em um terminal separado):
```bash
npm start
```

2. **Configure o port forwarding** (se o dispositivo estiver conectado via USB):
   - Via Android Studio: Device Manager > Port forwarding > Adicione 8081:8081
   - Ou via linha de comando: `adb reverse tcp:8081 tcp:8081`

3. **Execute o app**:
```bash
npm run android
```

**Nota:** Se aparecer "Unable to load script", certifique-se de que:
- O Metro bundler está rodando (`npm start`)
- O port forwarding está configurado (8081 -> 8081)
- O dispositivo está conectado via USB ou na mesma rede Wi-Fi

#### iOS

```bash
cd ios && pod install && cd ..
npm run ios
```

## Uso

1. **Buscar rota**: Preencha os campos de origem e destino (ou use sua localização atual) e clique em "Buscar Rota"
2. **Visualizar radares**: Os radares próximos à rota serão exibidos no mapa com clustering automático
3. **Alertas**: Quando você se aproximar de um radar (menos de 100m), um alerta será exibido

## Solução de Problemas

### Erro "Unable to load script"

Se aparecer esse erro ao abrir o app:

1. **Certifique-se que o Metro bundler está rodando:**
   ```bash
   npm start
   ```

2. **Configure o port forwarding:**
   - Abra o Android Studio
   - Device Manager > Seu dispositivo > Port forwarding
   - Adicione: Host port `8081` → Device port `8081`

3. **Se ainda não funcionar:**
   - No dispositivo, pressione Ctrl+M (ou agite)
   - Settings > Debug server host & port for device
   - Digite: `10.0.2.2:8081` (para USB) ou `SEU_IP:8081` (para Wi-Fi)

Veja o arquivo `INSTRUCOES_RAPIDAS.md` para instruções detalhadas.

## Tecnologias

- React Native 0.74.3
- @rnmapbox/maps 10.1.0
- NativeWind (Tailwind CSS para React Native)
- TypeScript
- react-native-geolocation-service

## Licença

MIT

