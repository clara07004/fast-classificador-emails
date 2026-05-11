# Quickstart: Executar 24/7 com PM2

## 3 passos para rodar agora:

### 1️⃣ Instalar PM2 (uma única vez)
```bash
npm run pm2:install
```
> Instala PM2 globalmente + suporte para auto-pull de atualizações

### 2️⃣ Iniciar o worker
```bash
npm run pm2:start
```
> Inicia o classificador com auto-restart automático

### 3️⃣ Verificar status
```bash
npm run pm2:status
```
> Deve mostrar `online` e uptime crescente

---

## Depois...

**Ver logs em tempo real:**
```bash
npm run pm2:logs
```
(Ctrl+C para sair)

**Parar temporariamente:**
```bash
npm run pm2:stop
```

**Reiniciar após atualização:**
```bash
npm run pm2:restart
```

**Ver histórico:**
```bash
pm2 list
pm2 info classificador-emails
```

---

## O que foi corrigido?

✅ Worker agora detecta desconexões silenciosas (watchdog a cada 1 min)
✅ IDLE timeout agora é seguro (25 min, antes do timeout de 28 min do servidor)
✅ Reconexão automática com retry infinito até funcionar
✅ PM2 reinicia o processo se morrer

**Resultado:** Classificador rodará 24/7 sem ação manual
