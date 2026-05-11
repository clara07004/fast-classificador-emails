# Auto-Boot: Rodar 24/7 com Computador Ligado ou Desligado

## Opção 1: Via Pasta Startup (Mais Simples) ⭐

1. Abra o Explorer
2. Digite na barra de endereço:
   ```
   C:\Users\HP\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup
   ```
3. Crie um atalho para `iniciar-worker.bat` nesta pasta

**Resultado:** Toda vez que o computador ligar, o worker inicia automaticamente em ~10 segundos

---

## Opção 2: Via Task Scheduler (Mais Robusto)

1. Abra **Task Scheduler** (Windows + R → `taskschd.msc`)
2. Clique em **Create Task**
3. Configure:
   - **Name:** `Fast-Classificador-Emails`
   - **Description:** Classificador automático de emails — 24/7
   - **Run with highest privileges:** ✓ Checked

4. **Triggers tab** → New Trigger:
   - Begin the task: `At startup`
   - Delay task for: `30 seconds`

5. **Actions tab** → New Action:
   - Program: `C:\Program Files\nodejs\node.exe`
   - Arguments: `C:\Users\HP\Documents\fast-classificador-emails\src\index.js`
   - Start in: `C:\Users\HP\Documents\fast-classificador-emails`

6. **Conditions tab:**
   - ☑ Wake the computer to run this task
   - ☑ Start the task only if the computer is on AC power (desmarque se usar bateria)

7. **Settings tab:**
   - ☑ Allow task to be run on demand
   - ☑ Run task as soon as possible after a scheduled start is missed
   - If the running task does not end when requested: `Stop the task`

8. Clique **OK**

---

## Verificar se Está Rodando

```bash
# Ver processos ativos
npm run pm2:status

# Ver logs
npm run pm2:logs
```

---

## Desabilitar Auto-Boot

Se precisar parar de rodar no boot:

**Opção 1 (Startup):**
- Delete o atalho da pasta Startup

**Opção 2 (Task Scheduler):**
- Abra Task Scheduler
- Procure `Fast-Classificador-Emails`
- Clique direito → Disable

---

## Nota Importante

**Se o computador ficar desligado por muito tempo:**
- O Convex pode resetar credenciais
- Verificar `.env` está com `CONVEX_DEPLOY_KEY` válida
- Se falhar, rodar manualmente: `npm run pm2:restart`

---

## Próximos Passos

1. Escolha Opção 1 ou 2 acima
2. Reinicie o computador
3. Verifique se worker está rodando: `npm run pm2:status`
4. Done! 🎉
