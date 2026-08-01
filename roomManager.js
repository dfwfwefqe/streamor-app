// In-memory data structures
const rooms = new Map();
const users = new Map();

/**
 * Handle a user joining a room.
 * @param {string} socketId - The socket ID.
 * @param {string} roomId - The ID of the room.
 * @param {object} userPayload - The user payload {userId, username}.
 * @returns {object} { room, role, isNewRoom }
 */
export const joinRoom = (socketId, roomId, userPayload) => {
  let isNewRoom = false;
  let room = rooms.get(roomId);

  if (!room) {
    // Create new room if it doesn't exist
    isNewRoom = true;
    room = {
      hostId: socketId,
      currentMedia: null,
      playbackTimestamp: 0,
      isPlaying: false,
      title: userPayload.title || 'Watch Party',
      tmdbId: userPayload.tmdbId || null,
      guests: []
    };
    rooms.set(roomId, room);
  } else if (userPayload.title) {
    room.title = userPayload.title;
    if (userPayload.tmdbId) room.tmdbId = userPayload.tmdbId;
  }

  const role = room.hostId === socketId ? 'Host' : 'Guest';

  if (role === 'Guest') {
    if (!room.guests.includes(socketId)) {
        room.guests.push(socketId);
    }
  }

  // Save user info
  users.set(socketId, {
    userId: userPayload.userId,
    username: userPayload.username,
    roomId,
    role
  });

  return { room, role, isNewRoom };
};

/**
 * Get all active public rooms.
 */
export const getActiveRooms = () => {
  const list = [];
  for (const [roomId, room] of rooms.entries()) {
    const hostUser = users.get(room.hostId);
    list.push({
      roomId,
      hostUsername: hostUser ? hostUser.username : 'Host',
      title: room.title || 'Watch Party',
      tmdbId: room.tmdbId || null,
      userCount: 1 + (room.guests ? room.guests.length : 0),
      isPlaying: room.isPlaying || false
    });
  }
  return list;
};

/**
 * Get user by socket ID.
 * @param {string} socketId - The socket ID.
 * @returns {object|undefined} The user object or undefined.
 */
export const getUser = (socketId) => {
  return users.get(socketId);
};

/**
 * Get room by room ID.
 * @param {string} roomId - The room ID.
 * @returns {object|undefined} The room object or undefined.
 */
export const getRoom = (roomId) => {
    return rooms.get(roomId);
};

/**
 * Update room playback state.
 * @param {string} roomId - The room ID.
 * @param {object} updates - Updates to apply { isPlaying, playbackTimestamp }.
 */
export const updateRoomState = (roomId, updates) => {
    const room = rooms.get(roomId);
    if (room) {
        if (updates.isPlaying !== undefined) room.isPlaying = updates.isPlaying;
        if (updates.playbackTimestamp !== undefined) room.playbackTimestamp = updates.playbackTimestamp;
        if (updates.mediaUrl !== undefined) room.currentMedia = updates.mediaUrl;
    }
};

/**
 * Remove user from memory. If host leaves, return true to indicate room needs cleanup.
 * @param {string} socketId - The socket ID to remove.
 * @returns {object|null} If host left, returns { roomId, guestIds }. Otherwise null.
 */
export const removeUser = (socketId) => {
  const user = users.get(socketId);
  if (!user) return null;

  users.delete(socketId);

  const room = rooms.get(user.roomId);
  if (!room) return null;

  if (room.hostId === socketId) {
    // Host disconnected, cleanup entire room
    const guestIds = [...room.guests];
    // Remove guests from users map
    guestIds.forEach(id => users.delete(id));
    rooms.delete(user.roomId);
    return { roomId: user.roomId, guestIds, hostLeft: true };
  } else {
    // Guest disconnected
    room.guests = room.guests.filter(id => id !== socketId);
    // If room is empty, delete it (shouldn't happen if host is still there, but good practice)
    if (room.guests.length === 0 && !users.has(room.hostId)) {
        rooms.delete(user.roomId);
    }
    return { roomId: user.roomId, guestIds: [socketId], hostLeft: false };
  }
};
