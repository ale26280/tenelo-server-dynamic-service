module.exports = {
  apps: [
    {
      name: "app_server",
      script: "./server.js",
      watch: true,
      instances: 'max',
      env: {
        'MONGO_HOST': '192.168.0.5',
        'MONGO_PORT': '27998',
        'SERVER_PORT': 6010,
        'AUTH_URL': 'https://tenelo.ddns.net/auth/v1/auth/access-token',
        'AUTH_API': "https://tenelo.ddns.net/auth/v1/",
        'PL': "gb",
        'GENERA_API': 'http://localhost:5008/',
        'PATH_UPLOADS':"/home/ub/Documentos/development/github/tenelo.com.ar/mediaserver/uploads/",
        "NODE_ENV": "production",
        'TZ': 'America/Argentina/Buenos_Aires'
      }
    }
  ]
}
