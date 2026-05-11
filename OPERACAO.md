# Operação 24/7 do Classificador de Emails

## Problema Identificado ❌
O worker estava desligando sozinho todos os dias porque:
1. **Loop de reconexão não era robusto** — desconectava a cada 27 min e falhas no logout deixavam o processo pendurado
2. **Sem supervisor de processo** — se o Node.js morresse, ninguém reiniciava
3. **Sem heartbeat** — desconexões silenciosas não eram detectadas

## Solução Implementada ✅

### 1. Melhorias no Worker (`src/imap/worker.js`)
- ✓ **Watchdog a cada 1 min** — detecta desconexões silenciosas
- ✓ **IDLE com timeout seguro** — 25 min (antes do timeout de 28 min do servidor)
- ✓ **Retry indefinido** — não desiste de reconectar
- ✓ **Reconexão preventiva** — ao invés de simplesmente desconectar, reconecta imediatamente

### 2. PM2 Configuration (`pm2.config.js`)
- ✓ **Auto-restart** — se o processo morrer, reinicia em segundos
- ✓ **Logging em arquivo** — `logs/out.log` e `logs/err.log`
- ✓ **Memory limit** — auto-restart se usar > 500MB
- ✓ **Graceful shutdown** — 5 segundos para encerrar properly

### 3. Scripts Facilitados (`package.json`)
```bash
npm run pm2:start      # Inicia com PM2
npm run pm2:stop       # Para o processo
npm run pm2:restart    # Reinicia
npm run pm2:logs       # Ver logs em tempo real
npm run pm2:status     # Ver status
```

---

## Instruções de Execução

### Opção 1: Desenvolvimento Local (teste rápido)
```bash
# Terminal simples
npm start

# Com reload automático
npm run dev
```

### Opção 2: Execução 24/7 com PM2 ⭐ RECOMENDADO
```bash
# 1. Instalar PM2 globalmente (uma única vez)
npm run pm2:install

# 2. Iniciar o worker
npm run pm2:start

# 3. Verificar status
npm run pm2:status

# 4. Ver logs em tempo real
npm run pm2:logs

# 5. Parar quando necessário
npm run pm2:stop

# 6. Reiniciar (ex: após atualização de código)
npm run pm2:restart
```

### Opção 3: Execução no Windows (Task Scheduler)
Se preferir usar Task Scheduler do Windows ao invés de PM2:

**Criar nova tarefa:**
1. Task Scheduler → Create Task
2. Nome: `Fast-Classificador-Emails`
3. **Trigger:** At log on, repeat every 1 hour
4. **Action:**
   ```
   Program: C:\Program Files\nodejs\node.exe
   Arguments: C:\Users\HP\Documents\fast-classificador-emails\src\index.js
   Start in: C:\Users\HP\Documents\fast-classificador-emails
   ```
5. **Options:** Run with highest privileges, Run whether user is logged in or not
6. **Conditions:** Wake computer if sleeping

---

## Monitoramento

### Ver logs em tempo real
```bash
npm run pm2:logs
```

### Ver histórico de restarts
```bash
pm2 save
pm2 logs classificador-emails
```

### Verificar saúde do processo
```bash
npm run pm2:status
# Deve mostrar: "online" e uptime crescente
```

### Se o processo continuar caindo:
1. Check logs: `npm run pm2:logs`
2. Ver erro específico nas últimas linhas
3. Verificar .env está com credenciais corretas
4. Verificar conexão IMAP: `nc -zv mail.cscempresarial.com.br 993`

---

## Sinais do Sistema

O worker agora monitora:

| Sinal | Ação |
|-------|------|
| `exists` (novos emails) | Processa imediatamente |
| Inatividade por 90s | Reconnecta (watchdog) |
| 25 min em IDLE | Reconnecta preventivamente (RFC 2177) |
| Erro de conexão | Retry com backoff exponencial |
| 5+ falhas seguidas | Aguarda 10s e tenta novamente |

---

## Troubleshooting

### "Worker está offline mas preciso dele rodando"
```bash
# Verificar se está realmente parado
npm run pm2:status

# Reiniciar
npm run pm2:restart

# Se falhar, deletar e recriar
npm run pm2:delete
npm run pm2:start
```

### "Vejo muitos logs de erro no pm2:logs"
1. Check .env está com credenciais corretas
2. Test IMAP connection: `openssl s_client -connect mail.cscempresarial.com.br:993`
3. Ver logs completos: `cat logs/err.log | tail -50`

### "Preciso resetar o estado do worker"
```bash
# Deletar e recriar (limpa estado em memória)
npm run pm2:delete
npm run pm2:start
```

### "Quero mudar o LOG_LEVEL para debug"
Editar `pm2.config.js`, linha com `LOG_LEVEL`, depois:
```bash
npm run pm2:restart
```

---

## Production Checklist

- [ ] `.env` está com credenciais corretas
- [ ] PM2 instalado globalmente: `npm run pm2:install`
- [ ] Worker iniciado com PM2: `npm run pm2:start`
- [ ] Status é "online": `npm run pm2:status`
- [ ] Nenhum erro em `logs/err.log` da última hora
- [ ] Primeiro email testado foi classificado corretamente
- [ ] Monitoramento ativo: verificar status 1x por dia

---

## Notas Técnicas

**Por que 27 min de IDLE timeout?**
- RFC 2177 recomenda < 28 min entre comandos
- CSC Empresarial pode fazer logout após inatividade de 28 min
- Reconnectamos aos 25 min para segurança

**Por que 90s de watchdog timeout?**
- Detecção rápida de mortes silenciosas
- Sem sobrecarregar com pings demais

**Por que PM2 e não systemd?**
- Mais portável (Windows + Linux)
- Melhor logging e monitoramento
- Fácil de parar/reiniciar
