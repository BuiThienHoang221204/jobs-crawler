# Use Playwright's official image which includes browsers and required libs
FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

# Install dependencies using package-lock if present for reproducible installs
COPY package*.json ./
RUN npm ci --omit=dev || npm install

# Copy source
COPY . .

# Expose the port Railway usually maps inside the container
EXPOSE 8080

# Start the app
CMD ["node", "index.js"]
