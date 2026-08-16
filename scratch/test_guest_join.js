import { io } from 'socket.io-client';

const roomId = 'J4XPFR'; // Replace with actual room ID if needed
const serverUrl = 'https://streamor-app-production-2280.up.railway.app';
const socket = io(serverUrl);

socket.on('connect', () => {
  console.log('Connected to server');
  socket.emit('join_room', {
    roomId,
    user: {
      userId: `guest-test-123`,
      username: 'TestGuest',
    }
  });
});

socket.on('room_joined', (payload) => {
  console.log('Room Joined!', payload);
  setTimeout(() => process.exit(0), 1000);
});

socket.on('error_occurred', (err) => {
  console.error('Error:', err);
  process.exit(1);
});
