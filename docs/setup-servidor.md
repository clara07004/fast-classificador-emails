# Setup do Servidor — SaveInCloud VPS

## Requisitos do servidor
- Ubuntu 22.04 LTS
- Mínimo 1 vCPU, 1GB RAM (recomendado 2GB para múltiplos workers)
- IP fixo (padrão SaveInCloud VPS)

## 0. Acessar o servidor via SSH

```bash
ssh -p 3022 38076@gate.paas.saveincloud.net.br
```

## 1. Instalar Node.js (via nvm)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
node -v
```

## 2. Instalar PM2

```bash
npm install -g pm2
```

## 3. Clonar o repositório

```bash
git clone <URL_DO_REPOSITORIO> classificador-email
cd classificador-email
npm ci --omit=dev
```

## 4. Configurar variáveis de ambiente

```bash
cp .env.example .env
nano .env   # preencher todos os valores
chmod 600 .env
```

## 5. Iniciar o worker com PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # seguir as instruções exibidas para auto-start no boot
```

## 6. Verificar funcionamento

```bash
pm2 status
pm2 logs classificador-email --lines 50
```

## 7. Configurar logrotate

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

## Comandos úteis no dia a dia

| Ação | Comando |
|---|---|
| Ver status | `pm2 status` |
| Ver logs em tempo real | `pm2 logs classificador-email` |
| Reiniciar worker | `pm2 restart classificador-email` |
| Parar worker | `pm2 stop classificador-email` |
| Deploy de nova versão | `bash scripts/deploy.sh` |
| Ver uso de memória/CPU | `pm2 monit` |
