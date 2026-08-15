import { z } from 'zod';

export const userSchema = z.object({
  userId: z.string().min(1).max(100),
  username: z.string().min(1).max(100),
  // Optional room metadata — only meaningful when the first joiner creates the room
  title: z.string().min(1).max(300).optional(),
  tmdbId: z.union([z.number().int().positive(), z.string().min(1).max(50)]).optional().nullable(),
});

export const joinRoomSchema = z.object({
  roomId: z.string().min(1).max(50),
  user: userSchema,
});

export const chatMessageSchema = z.object({
  message: z.string().min(1).max(1000),
});

export const syncPlaySchema = z.object({
  timestamp: z.number().min(0),
});

export const syncPauseSchema = z.object({
  timestamp: z.number().min(0),
});

export const syncSeekSchema = z.object({
  timestamp: z.number().min(0),
});

export const syncSubtitleSchema = z.object({
  url: z.string().optional().nullable(),
  lang: z.string().optional().nullable(),
  content: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  delay: z.number().optional().nullable(),
}).passthrough();

export const syncSourceSchema = z.object({
  url: z.string().nullable(),
  mediaType: z.enum(['direct', 'magnet']).nullable().optional(),
  type: z.string().optional(), // legacy compat
  title: z.string().nullable().optional(),
});
