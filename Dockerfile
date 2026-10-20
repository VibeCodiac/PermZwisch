FROM node:22-bookworm-slim
ENV NODE_ENV=production TZ=Europe/Berlin DATA_DIR=/data
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 3000
CMD ["node", "src/server.js"]
