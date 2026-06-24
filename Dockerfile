# Imagem de producao para o servico medcenter-agendamento.
FROM node:22-alpine

# Diretorio da aplicacao
WORKDIR /app

# Instala apenas dependencias de producao primeiro (cache de camadas)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copia o restante do codigo
COPY . .

# A aplicacao roda como usuario nao-root (ja existe na imagem node)
USER node

# Porta padrao do servidor (sobrescrita pela env PORT no EasyPanel se necessario)
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "src/server.js"]
