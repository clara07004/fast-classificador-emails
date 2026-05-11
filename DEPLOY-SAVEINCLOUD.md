# Deploy no SaveInCloud VPS — Guia Rápido

## Objetivo
Rodar o classificador 24/7 no seu servidor SaveInCloud, independente do seu computador estar ligado ou desligado.

---

## Passo 1: Acessar Web SSH do SaveInCloud

1. Abra o painel SaveInCloud: https://app.paas.saveincloud.net.br
2. Navegue até **Configurações → Acesso SSH**
3. Clique no botão verde **CONECTAR** (Web SSH)
4. Você verá um menu. **Selecione:**
   - `3` para escolher o ambiente CLARA
   - `3` novamente para escolher o container Node.js

---

## Passo 2: Clonar o script de deploy

Cole este comando no terminal Web SSH:

```bash
curl -O https://raw.githubusercontent.com/clarabarbosa/fast-classificador-emails/main/deploy-server.sh && chmod +x deploy-server.sh
```

> Se não funcionar, copie/cole manualmente o arquivo `deploy-server.sh` do projeto.

---

## Passo 3: Executar o deploy

```bash
./deploy-server.sh
```

O script vai:
- ✅ Clonar o repositório (ou atualizar se já existe)
- ✅ Instalar dependências (npm install)
- ✅ Criar .env com suas credenciais
- ✅ Instalar PM2 globalmente
- ✅ Iniciar o worker com PM2
- ✅ Configurar auto-restart no boot do servidor

**Tempo estimado:** 2-3 minutos

---

## Passo 4: Verificar status

Após o deploy, você verá algo como:

```
┌────┬──────────────────────────┬─────────────┬──────────┬──────────┬──────────┐
│ id │ name                     │ namespace   │ status   │ cpu      │ mem      │
├────┼──────────────────────────┼─────────────┼──────────┼──────────┼──────────┤
│ 0  │ classificador-emails     │ default     │ online   │ 0.3%     │ 85.4mb   │
└────┴──────────────────────────┴─────────────┴──────────┴──────────┴──────────┘
```

Se disser **online**, sucesso! 🎉

---

## Passo 5: Ver logs

Para ver os logs em tempo real:

```bash
pm2 logs classificador-emails
```

Você vai ver mensagens como:
```
classificador-emails | ✓ Conectado ao IMAP com sucesso
classificador-emails | ✓ INBOX aberta
classificador-emails | ✓ Pastas Fast/* garantidas
classificador-emails | Entrando em modo IDLE...
```

---

## Próximas vezes

**Para parar o worker:**
```bash
pm2 stop classificador-emails
```

**Para reiniciar:**
```bash
pm2 restart classificador-emails
```

**Para ver histórico de restarts:**
```bash
pm2 info classificador-emails
```

---

## Troubleshooting

### "Erro de conexão ao IMAP"
- Verificar `.env` está com credenciais corretas
- Ver logs: `pm2 logs classificador-emails`

### "Processo continua caindo"
- Ver logs completos: `pm2 logs classificador-emails --lines 100`
- Verificar se o Node.js está instalado: `node --version`

### "Quero atualizar o código"
```bash
cd ~/fast-classificador-emails
git pull
pm2 restart classificador-emails
```

---

## Importante

Uma vez deployado, **nunca mais você precisa fazer nada**:
- ✅ Roda 24/7
- ✅ Auto-restart se cair
- ✅ Seu computador pode estar desligado
- ✅ Auto-reinicia quando o servidor rebootar

🎉 **Classificador verdadeiramente automático!**
