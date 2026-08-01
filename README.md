# WatchParty - Decentralized Streaming Platform

A decentralized watch-party platform where users can watch movies together in real-time with synchronized playback, chat, and P2P streaming via WebRTC and WebTorrent.

## Architecture

This platform consists of three main parts:
1. **Signaling Server** (Node.js + Express + Socket.io) — Room management, chat, playback sync, WebRTC signaling
2. **Web Client** (Next.js 16 + React 19 + Tailwind CSS) — TMDB catalog, room UI, chat, guest player
3. **Desktop Client** (Electron 43 + WebTorrent) — Host player with torrent streaming support

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 3, Zustand 5 |
| Realtime | Socket.io 4 (signaling + chat + sync) |
| P2P Streaming | WebRTC (`RTCPeerConnection`, `captureStream`, `replaceTrack`) |
| Torrent | WebTorrent 3 + memory-chunk-store (Electron only) |
| HLS | hls.js for `.m3u8` streams |
| Validation | Zod (client + server) |
| Movie API | TMDB (catalog) + YTS (torrent search) |

## How to run the project locally (Development Mode)

### Step 1: Start the Signaling Server
Open a terminal in the root directory and run:
```bash
npm run socket
```
*This starts the Socket.io server on port 3001.*

### Step 2: Configure Environment Variables
You need a TMDB API key to load movies.
1. Create an account on [TMDB (The Movie Database)](https://www.themoviedb.org/).
2. Get your API Key from your profile settings.
3. Open the `.env.local` file in the root directory and replace `your_tmdb_api_key_here` with your actual key.

### Step 3: Start the Next.js Web Client
Open a **new** terminal in the root directory and run:
```bash
npm run dev
```
*This starts the Next.js app on `http://localhost:3000`.*

### Step 4 (Optional): Start the Electron Desktop Client (Host)
Open a **new** terminal in the root directory and run:
```bash
npm run electron:dev
```
*This compiles the Electron main process and launches the desktop client pointing to `http://localhost:3000`.*

### Viewing the App
Open your browser and navigate to `http://localhost:3000`.
- **Note:** For the Host to share a torrent-based video stream, the Electron app must be running. For testing the Web UI, TMDB catalog, and UI layout, the Next.js app alone is sufficient.

## Project Structure

```
├── app/                    # Next.js App Router
│   ├── api/               # API routes (TMDB, YTS)
│   ├── room/[id]/         # Watch room page
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page (catalog)
├── components/             # React components
│   ├── UniversalPlayer.tsx
│   ├── StreamResolver.tsx
│   ├── ChatSidebar.tsx
│   ├── WatchRoomLayout.tsx
│   ├── MediaSourceInput.tsx
│   ├── RoomModal.tsx
│   ├── MediaGrid.tsx / MediaCard.tsx
│   └── Navbar.tsx
├── electron/              # Electron main process
│   ├── main.ts            # IPC handlers, window, YTS search
│   ├── preload.ts         # Context bridge (window.electron API)
│   └── torrentManager.ts  # WebTorrent client + HTTP stream server
├── store/                 # Zustand state management
│   ├── useRoomStore.ts    # Room state (roomId, role, mediaUrl, tmdbId)
│   ├── chatStore.ts       # Chat messages
│   └── uiStore.ts         # UI state (modal)
├── types/
│   └── electron.d.ts      # Global type for window.electron
├── server.js              # Express + Socket.io server
├── socketHandlers.js      # Socket.io event handlers
├── roomManager.js         # In-memory room/user management
└── validators.js          # Zod schemas for socket payloads