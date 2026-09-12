FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
COPY scripts ./scripts
EXPOSE 3001
USER node
# Si existe /certs/ca.pem (proxy corporativo), Node lo agrega a las autoridades confiables.
CMD ["sh", "-c", "[ -f /certs/ca.pem ] && export NODE_EXTRA_CA_CERTS=/certs/ca.pem; exec node src/server.js"]
