# Use Node.js LTS version
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Expose port (Fly.io will use the PORT from fly.toml)
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
