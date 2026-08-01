import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { setupSocketHandlers } from './socketHandlers.js';

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());

import { getActiveRooms } from './roomManager.js';

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Active Rooms list endpoint
app.get('/api/rooms', (req, res) => {
  res.status(200).json({ rooms: getActiveRooms() });
});

const httpServer = createServer(app);

// Optimized Socket.io configuration for connection stability
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000, // 60 seconds
  pingInterval: 25000, // 25 seconds
  transports: ['websocket', 'polling']
});

setupSocketHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`Watch-Party Signaling Server running on port ${PORT}`);
});
