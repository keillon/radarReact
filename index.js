import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
// Fallback: builds antigos (radarbot) ainda solicitam "RadarBot" — registrar ambos
if (appName !== 'RadarBot') {
  AppRegistry.registerComponent('RadarBot', () => App);
}
