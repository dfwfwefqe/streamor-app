FROM node:20-alpine
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# Build Next.js
RUN npm run build

# Socket.IO server runs on 3001, Next.js on PORT (env)
# We'll use concurrently to run both
EXPOSE 3000 3001

CMD ["npm", "run", "start:all"]
