FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

ENV PORT=8080

COPY package*.json ./
RUN npm ci --omit=dev || npm install

COPY . .

EXPOSE 8080

CMD ["node", "index.js"]