FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev || npm install

COPY . .

EXPOSE 8080

CMD ["node", "index.js"]