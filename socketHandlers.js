import {
    joinRoomSchema,
    chatMessageSchema,
    syncPlaySchema,
    syncPauseSchema,
    syncSeekSchema,
    syncSubtitleSchema,
    syncSourceSchema
} from './validators.js';
import { joinRoom, getUser, getRoom, removeUser, updateRoomState, getActiveRooms } from './roomManager.js';

export const setupSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Get Active Rooms
    socket.on('get_active_rooms', () => {
      socket.emit('active_rooms_list', { rooms: getActiveRooms() });
    });

    // Join Room
    socket.on('join_room', (payload) => {
      try {
        const parsed = joinRoomSchema.parse(payload);
        const { roomId, user } = parsed;

        const { room, role, isNewRoom } = joinRoom(socket.id, roomId, user);

        socket.join(roomId);

        socket.emit('room_joined', {
          roomId,
          role,
          currentMedia: room ? room.currentMedia : null,
          isPlaying: room ? room.isPlaying : false,
          playbackTimestamp: room ? room.playbackTimestamp : 0
        });

        // Broadcast to others in the room (including socket ID so host can send WebRTC offer)
        socket.to(roomId).emit('user_joined', {
          userId: user.userId,
          username: user.username,
          socketId: socket.id,
          role
        });

        console.log(`User ${user.username} (${socket.id}) joined room ${roomId} as ${role}`);
      } catch (error) {
        console.error('join_room error:', error.message);
        socket.emit('error_occurred', { message: 'Invalid join_room payload', details: error.message });
      }
    });

    // Chat Message
    socket.on('chat_message', (payload) => {
        try {
            const parsed = chatMessageSchema.parse(payload);
            const user = getUser(socket.id);

            if (!user) {
                return socket.emit('error_occurred', { message: 'Not in a room' });
            }

            // Broadcast to everyone in the room EXCEPT sender
            socket.to(user.roomId).emit('chat_message', {
                userId: user.userId,
                username: user.username,
                message: parsed.message,
                timestamp: Date.now()
            });
        } catch (error) {
            console.error('chat_message error:', error.message);
            socket.emit('error_occurred', { message: 'Invalid chat message', details: error.message });
        }
    });

    // Sync Play
    socket.on('sync_play', (payload) => {
        try {
            const parsed = syncPlaySchema.parse(payload);
            const user = getUser(socket.id);

            if (!user) return socket.emit('error_occurred', { message: 'Not in a room' });
            if (user.role !== 'Host') return socket.emit('unauthorized_action', { message: 'Only host can sync play' });

            updateRoomState(user.roomId, { isPlaying: true, playbackTimestamp: parsed.timestamp });

            socket.to(user.roomId).emit('sync_play', { timestamp: parsed.timestamp });
        } catch (error) {
            console.error('sync_play error:', error.message);
            socket.emit('error_occurred', { message: 'Invalid sync_play payload', details: error.message });
        }
    });

    // Sync Pause
    socket.on('sync_pause', (payload) => {
        try {
            const parsed = syncPauseSchema.parse(payload);
            const user = getUser(socket.id);

            if (!user) return socket.emit('error_occurred', { message: 'Not in a room' });
            if (user.role !== 'Host') return socket.emit('unauthorized_action', { message: 'Only host can sync pause' });

            updateRoomState(user.roomId, { isPlaying: false, playbackTimestamp: parsed.timestamp });

            socket.to(user.roomId).emit('sync_pause', { timestamp: parsed.timestamp });
        } catch (error) {
            console.error('sync_pause error:', error.message);
            socket.emit('error_occurred', { message: 'Invalid sync_pause payload', details: error.message });
        }
    });

    // Sync Seek
    socket.on('sync_seek', (payload) => {
        try {
            const parsed = syncSeekSchema.parse(payload);
            const user = getUser(socket.id);

            if (!user) return socket.emit('error_occurred', { message: 'Not in a room' });
            if (user.role !== 'Host') return socket.emit('unauthorized_action', { message: 'Only host can sync seek' });

            updateRoomState(user.roomId, { playbackTimestamp: parsed.timestamp });

            socket.to(user.roomId).emit('sync_seek', { timestamp: parsed.timestamp });
        } catch (error) {
            console.error('sync_seek error:', error.message);
            socket.emit('error_occurred', { message: 'Invalid sync_seek payload', details: error.message });
        }
    });

    // Sync Subtitle
    socket.on('sync_subtitle', (payload) => {
        try {
            const parsed = syncSubtitleSchema.parse(payload);
            const user = getUser(socket.id);

            if (!user) return socket.emit('error_occurred', { message: 'Not in a room' });
            socket.to(user.roomId).emit('sync_subtitle', {
                url: parsed.url || '',
                lang: parsed.lang || 'fa',
                content: parsed.content || null,
                name: parsed.name || null,
                delay: parsed.delay || 0
            });
        } catch (error) {
            console.error('sync_subtitle error:', error.message);
            socket.emit('error_occurred', { message: 'Invalid sync_subtitle payload', details: error.message });
        }
    });

    // Sync Source
    socket.on('sync_source', (payload) => {
        try {
            const parsed = syncSourceSchema.parse(payload);
            const user = getUser(socket.id);

            if (!user) return socket.emit('error_occurred', { message: 'Not in a room' });
            if (user.role !== 'Host') return socket.emit('unauthorized_action', { message: 'Only host can sync source' });

            // Update room state (null url means host cleared the source)
            updateRoomState(user.roomId, { mediaUrl: parsed.url || null });

            // Forward the full enriched payload to all guests
            socket.to(user.roomId).emit('sync_source', {
                url: parsed.url,
                mediaType: parsed.mediaType || null,
                title: parsed.title || null,
            });
        } catch (error) {
            console.error('sync_source error:', error.message);
            socket.emit('error_occurred', { message: 'Invalid sync_source payload', details: error.message });
        }
    });

    // Leave Room (Explicit)
    socket.on('leave_room', () => {
        try {
            handleDisconnect(socket, io);
        } catch (error) {
            console.error('leave_room error:', error.message);
        }
    });

    // WebRTC Stream Request: Guest asks host to start broadcasting
    socket.on('webrtc_stream_request', () => {
        try {
            const user = getUser(socket.id);
            if (!user) return;
            const room = getRoom(user.roomId);
            if (!room) return;
            // Forward the request to the host, including this guest's socket ID
            io.to(room.hostId).emit('webrtc_stream_request', {
                senderId: socket.id
            });
            console.log(`Guest ${socket.id} requested WebRTC stream from host ${room.hostId}`);
        } catch (error) {
            console.error('webrtc_stream_request error:', error.message);
        }
    });

    // WebRTC Signaling
    socket.on('webrtc_offer', (payload) => {
        try {
            const user = getUser(socket.id);
            if (!user) return;
            io.to(payload.targetId).emit('webrtc_offer', {
                senderId: socket.id,
                offer: payload.offer
            });
        } catch (error) {
            console.error('webrtc_offer error:', error.message);
        }
    });

    socket.on('webrtc_answer', (payload) => {
        try {
            const user = getUser(socket.id);
            if (!user) return;
            io.to(payload.targetId).emit('webrtc_answer', {
                senderId: socket.id,
                answer: payload.answer
            });
        } catch (error) {
            console.error('webrtc_answer error:', error.message);
        }
    });

    socket.on('webrtc_ice_candidate', (payload) => {
        try {
            const user = getUser(socket.id);
            if (!user) return;
            io.to(payload.targetId).emit('webrtc_ice_candidate', {
                senderId: socket.id,
                candidate: payload.candidate
            });
        } catch (error) {
            console.error('webrtc_ice_candidate error:', error.message);
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        try {
            handleDisconnect(socket, io);
            console.log(`Socket disconnected: ${socket.id}`);
        } catch (error) {
            console.error('disconnect error:', error.message);
        }
    });
  });
};

function handleDisconnect(socket, io) {
    const user = getUser(socket.id);
    if (!user) return;

    const cleanupInfo = removeUser(socket.id);
    if (!cleanupInfo) return;

    if (cleanupInfo.hostLeft) {
        // Disconnect all guests
        cleanupInfo.guestIds.forEach(guestId => {
            const guestSocket = io.sockets.sockets.get(guestId);
            if (guestSocket) {
                guestSocket.emit('room_closed', { message: 'Host has left the room' });
                guestSocket.leave(cleanupInfo.roomId);
                guestSocket.disconnect(true);
            }
        });
        console.log(`Room ${cleanupInfo.roomId} closed because host ${user.username} left.`);
    } else {
        // Notify others that guest left
        io.to(cleanupInfo.roomId).emit('user_left', {
            userId: user.userId,
            username: user.username,
            socketId: socket.id
        });
        socket.leave(cleanupInfo.roomId);
        console.log(`Guest ${user.username} left room ${cleanupInfo.roomId}`);
    }
}
