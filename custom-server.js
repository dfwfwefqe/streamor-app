import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';
import { setupSocketHandlers } from './socketHandlers.js';
import { getActiveRooms } from './roomManager.js';

const dev = false; // Always production on Railway
const port = parseInt(process.env.PORT || '3000');

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    const { pathname } = parsedUrl;

    // Health check endpoint
    if (pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
      return;
    }

    // Active Rooms list endpoint (so ActiveRoomsModal works in unified production mode)
    if (pathname === '/api/rooms') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({ rooms: getActiveRooms() }));
      return;
    }

    handle(req, res, parsedUrl);
  });

  // Socket.IO on the same server
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
    path: '/socket.io'
  });

  setupSocketHandlers(io);

  server.listen(port, '0.0.0.0', () => {
    console.log(`> Streamor ready on http://0.0.0.0:${port}`);
    console.log(`> Socket.IO available at ws://0.0.0.0:${port}/socket.io`);
  });
});
