FROM node:20-alpine
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# Build Next.js
RUN npm run build

# Expose the port Railway assigns
EXPOSE 3000

# Start custom server (Next.js + Socket.IO on same port)
CMD ["npm", "run", "start"]
