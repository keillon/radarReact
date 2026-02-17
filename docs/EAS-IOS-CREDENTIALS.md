# Credenciais iOS no EAS Build

## Problema

Em builds disparados por **GitHub** (ou outro CI), o EAS não pode pedir credenciais de forma interativa. Por isso aparece:

- `Distribution Certificate is not validated for non-interactive builds`
- `Credentials are not set up. Run this command again in interactive mode`

## Solução

As credenciais iOS precisam ser **configuradas uma vez** em modo **interativo** (na sua máquina). Depois disso, o EAS reutiliza essas credenciais em todos os builds (incluindo os do GitHub).

### Passo a passo

1. **Na sua máquina** (com Node e EAS CLI instalados), na raiz do projeto:

   ```bash
   npx eas-cli build --platform ios --profile production
   ```

2. Quando o EAS perguntar sobre credenciais:
   - Escolha **gerar/gerenciar credenciais no EAS** (recomendado)
   - Informe seu **Apple ID** (e senha/2FA se pedido)
   - Deixe o EAS criar o **Distribution Certificate** e o **Provisioning Profile** e guardá-los no servidor

3. Depois que o primeiro build interativo terminar (ou pelo menos a etapa de credenciais), os próximos builds **via GitHub** passarão a usar essas credenciais automaticamente.

### Alternativa: só configurar credenciais

Se quiser só configurar credenciais sem fazer um build completo:

```bash
npx eas-cli credentials --platform ios
```

Siga os prompts para vincular a conta Apple e configurar certificado/perfil. Depois disso, os builds não interativos usarão essas credenciais.

## Resumo

| Onde roda              | Modo        | Credenciais |
|------------------------|------------|-------------|
| Sua máquina (terminal) | Interativo | EAS pode pedir e salvar |
| GitHub Actions / EAS   | Não interativo | Usa as já salvas no EAS |

**Conclusão:** alguém com acesso ao projeto e à conta Apple Developer precisa rodar `eas build --platform ios --profile production` (ou `eas credentials --platform ios`) **uma vez** localmente. Depois, os builds pelo GitHub funcionam sem esse passo.
