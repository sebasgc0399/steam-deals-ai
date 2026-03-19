# Deploy en Ubuntu (Oracle Cloud VPS)

## 1. Instalar Node.js y npm

```bash
sudo apt update
sudo apt install -y curl ca-certificates gnupg
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 2. Instalar PM2

```bash
sudo npm install -g pm2
pm2 -v
```

## 3. Clonar el proyecto e instalar dependencias

```bash
git clone <URL_DEL_REPOSITORIO>
cd steam-deals-ai
npm install
```

## 4. Configurar variables de entorno

```bash
nano .env
```

Variables minimas sugeridas:

```dotenv
BOT_TOKEN=tu_token_de_telegram
OPENAI_API_KEY=tu_openai_api_key
DATABASE_PATH=./data/bot.db
```

## 5. Compilar y ejecutar con PM2

```bash
npm run build
pm2 start dist/bot/index.js --name steam-bot
pm2 save
```

## 6. Reinicio automatico al reiniciar el servidor

```bash
pm2 startup systemd
```

Ejecuta el comando adicional que PM2 imprime en pantalla y luego corre:

```bash
pm2 save
```
