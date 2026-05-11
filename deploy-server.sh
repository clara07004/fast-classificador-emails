#!/bin/bash
# Script de Deploy para SaveInCloud VPS
# Execute este script no terminal Web SSH do painel SaveInCloud
# Menu: Acesso SSH → Web SSH → CONECTAR

set -e

echo "🚀 Iniciando deploy do Classificador de Emails no SaveInCloud..."

# 1. Navegar para a pasta home
cd ~
echo "📁 Diretório: $(pwd)"

# 2. Verificar se Node.js está instalado
echo "📦 Verificando Node.js..."
node --version
npm --version

# 3. Clonar ou atualizar repositório
PROJECT_DIR="$HOME/fast-classificador-emails"

if [ -d "$PROJECT_DIR" ]; then
  echo "📥 Projeto já existe, atualizando..."
  cd "$PROJECT_DIR"
  git pull origin main
else
  echo "📥 Clonando repositório..."
  git clone https://github.com/clarabarbosa/fast-classificador-emails.git "$PROJECT_DIR"
  cd "$PROJECT_DIR"
fi

# 4. Instalar dependências
echo "📦 Instalando dependências..."
npm install

# 5. Criar .env com variáveis de ambiente
echo "⚙️  Configurando variáveis de ambiente..."
cat > .env << 'EOF'
# Identificação
PROJECT_NAME=fast-classificador-emails
ENVIRONMENT=production
NODE_ENV=production

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# IMAP — CSC Empresarial
IMAP_HOST=mail.cscempresarial.com.br
IMAP_PORT=993
IMAP_USER=clara.barbosa@fastdrywall.com.br
IMAP_PASSWORD=?9VM2oA1&b
IMAP_TLS=true

# SMTP
SMTP_HOST=mail.cscempresarial.com.br
SMTP_PORT=587
SMTP_USER=clara.barbosa@fastdrywall.com.br
SMTP_PASSWORD=?9VM2oA1&b

# APIs
ANTHROPIC_API_KEY=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
CONVEX_URL=https://savory-hornet-573.convex.cloud
CONVEX_DEPLOY_KEY=dev:savory-hornet-573|eyJ2MiI6ImRiOGM3OTFlMzc3YzRlNTg5NWE5ZjQ0ODNkNGJlZGI1In0=
VOYAGE_API_KEY=pa-r8EeT0omMLxKzvu_Q5qS54oDz7mPa4SPvJH1KDmlgkA

# Piloto
PILOTO_FUNCIONARIO_ID=jh752xekmrn5ebqvz66nv5mfsn85pjsa
EOF
echo "✅ .env criado"

# 6. Instalar/atualizar PM2 globalmente
echo "📦 Instalando PM2..."
npm install -g pm2

# 7. Deletar processo antigo se existir
pm2 delete classificador-emails 2>/dev/null || true

# 8. Iniciar com PM2
echo "🚀 Iniciando classificador com PM2..."
pm2 start pm2.config.cjs --name classificador-emails
pm2 save

# 9. Configurar auto-restart no boot
echo "⚙️  Configurando PM2 startup..."
pm2 startup ubuntu -u $(whoami) --hp $HOME

# 10. Verificar status
echo ""
echo "✅ Deploy concluído!"
echo ""
pm2 status
echo ""
echo "📊 Ver logs em tempo real:"
echo "   pm2 logs classificador-emails"
echo ""
echo "🔄 Reiniciar:"
echo "   pm2 restart classificador-emails"
