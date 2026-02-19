@echo off
REM Gera keystore de release para Play Console
cd /d %~dp0..\android\app
if exist radarzone-release.keystore (echo Keystore ja existe! & pause & exit /b 1)
keytool -genkeypair -v -storetype PKCS12 -keystore radarzone-release.keystore -alias radarzone -keyalg RSA -keysize 2048 -validity 10000
echo. & echo Keystore criado em android\app\radarzone-release.keystore
echo. & echo Proximo passo: copie android\keystore.properties.example para android\keystore.properties e preencha as senhas que voce definiu acima.
pause
