// PM2 ecosystem config — for VPS deployment without Docker
module.exports = {
  apps: [
    {
      name: 'zoomdl-server',
      script: 'dist/server/server/index.js',
      env: {
        PORT: 3000,
        NODE_ENV: 'production',
        ADMIN_USERNAME: 'admin',
        ADMIN_PASSWORD: 'changeme',
        SESSION_SECRET: 'change-this-to-random-string',
        AGENT_SECRET: 'change-this-to-random-string',
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
