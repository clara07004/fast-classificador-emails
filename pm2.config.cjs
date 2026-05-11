module.exports = {
  apps: [
    {
      name: 'classificador-emails',
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',

      // Restart automático
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',

      // Logging
      out_file: 'logs/out.log',
      err_file: 'logs/err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Timeout para graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 3000,

      // Reiniciar se usar muita memória (500MB)
      max_memory_restart: '500M',

      // Environment
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        LOG_FORMAT: 'json'
      },

      // Monitoramento
      watch: false, // Não restartar em mudanças de arquivo
      ignore_watch: ['logs', 'node_modules', '.git'],

      // Graceful shutdown
      exec_mode: 'fork',
      wait_ready: true,
      kill_timeout: 5000,

      error_file: 'logs/pm2-error.log',
      combine_logs: false
    }
  ],

  deploy: {
    production: {
      user: 'node',
      host: 'your-server-ip',
      ref: 'origin/main',
      repo: 'your-repo-url',
      path: '/var/www/fast-classificador',
      'post-deploy': 'npm install && npm start',
      'env': {
        NODE_ENV: 'production'
      }
    }
  }
};
