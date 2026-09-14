# Imagen unica para desplegar en un solo servicio (Railway, Render, Fly).
#
# Compila la interfaz y la sirve el propio backend. La alternativa —un
# contenedor para nginx y otro para Express— obliga a que el navegador vea dos
# dominios distintos, y la cookie de sesion es sameSite=lax de mismo origen:
# habria que aflojarla a SameSite=None. Con una sola imagen eso no hace falta.
#
# Para desarrollo local sigue valiendo docker-compose.yml, que usa los
# Dockerfile de backend/ y frontend/ por separado.

# --- Etapa 1: compilar la SPA ---
FROM node:20-alpine AS interfaz
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- Etapa 2: backend + interfaz compilada ---
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY backend/src ./src
COPY backend/scripts ./scripts
COPY database ./database
COPY --from=interfaz /app/dist ./publico

EXPOSE 3001
USER node

# Las migraciones corren antes de escuchar: si fallan, el contenedor no arranca
# y el error queda en el log del despliegue en vez de aparecer como un 500 suelto.
CMD ["sh", "-c", "node scripts/migrar.js && node src/server.js"]
