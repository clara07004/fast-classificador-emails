# Pendências ao assinar o Jelastic

Após converter a conta e iniciar o ambiente no SaveInCloud:

## 1. Iniciar o servidor
- Acessar https://app.paas.saveincloud.net.br/
- Clicar em "Iniciar" no ambiente pausado
- Aguardar o nó Node.js subir

## 2. Verificar o worker
```bash
pm2 list
pm2 logs classificador-email --lines 30 --nostream
```

## 3. Deploy do Convex (novos arquivos criados em 19/05)
Na pasta do projeto no servidor:
```bash
npx convex deploy
```
Isso vai publicar o endpoint `/health` que criamos para monitoramento.

## 4. Setar variável de ambiente no Convex Production
Dashboard → chatty-panda-261 → Settings → Environment Variables:
```
PILOTO_FUNCIONARIO_ID = jn7b1dbqkbnj03kg7wkw9gsgwn86n7k0
```

## 5. Configurar monitor no UptimeRobot
- Site: https://uptimerobot.com (conta gratuita)
- Tipo: HTTP(s)
- URL: https://chatty-panda-261.convex.cloud/health
- Intervalo: 5 minutos
- Alerta para: clara.barbosa@fastdrywall.com.br

Quando o worker parar, o UptimeRobot manda email automático.

## 6. Confirmar que o healthcheck local também está no cron do servidor
O `scripts/healthcheck.js` (versão Node, roda no próprio servidor) deve estar
no crontab como backup. Verificar com:
```bash
crontab -l
```
Se não estiver, adicionar:
```
*/5 * * * * cd /home/jelastic/fast-classificador-emails && node scripts/healthcheck.js >> /home/jelastic/logs/healthcheck.log 2>&1
```
