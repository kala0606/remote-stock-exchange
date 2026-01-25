# Use Node.js LTS version
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production || npm install --production

# Copy application files
COPY . .

# Expose port (Fly.io uses PORT env var, defaults to 8080)
EXPOSE 8080

# Start the application
CMD ["node", "server.js"]
