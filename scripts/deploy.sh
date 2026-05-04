#!/bin/bash
# deploy.sh — Script de deploy no servidor SaveInCloud
# Uso: bash scripts/deploy.sh
# Pré-requisito: SSH configurado, PM2 instalado no servidor, .env presente
# chmod +x scripts/deploy.sh  (executar uma vez no servidor)

set -e

echo "==> Atualizando código..."
git pull origin main

echo "==> Instalando dependências..."
npm ci --omit=dev

echo "==> Reiniciando worker via PM2..."
pm2 reload ecosystem.config.js --update-env

echo "==> Status atual:"
pm2 status

echo "==> Deploy concluído."
