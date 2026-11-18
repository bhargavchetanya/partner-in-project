import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { config } from '../config';
import { SESSION_COOKIE, userFromToken } from './auth';
import { Conversation } from '../models';

let io: Server | null = null;

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export function initRealtime(server: HttpServer): Server {
  io = new Server(server, {
    path: '/socket.io',
    cors: config.isProd ? undefined : { origin: config.appUrl, credentials: true },
    serveClient: false,
  });

  io.use(async (socket, next) => {
    const token = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
    const found = await userFromToken(token).catch(() => null);
    if (!found) return next(new Error('unauthorized'));
    socket.data.userId = String(found.user._id);
    next();
  });

  io.on('connection', (socket) => {
    const userId: string = socket.data.userId;
    socket.join(`user:${userId}`);

    socket.on('conversation:join', async (conversationId: unknown, ack?: (ok: boolean) => void) => {
      if (typeof conversationId !== 'string' || conversationId.length !== 24) return ack?.(false);
      const conv = await Conversation.findOne({ _id: conversationId, participants: userId }).lean().catch(() => null);
      if (!conv) return ack?.(false);
      socket.join(`conv:${conversationId}`);
      ack?.(true);
    });

    socket.on('conversation:leave', (conversationId: unknown) => {
      if (typeof conversationId === 'string') socket.leave(`conv:${conversationId}`);
    });

    socket.on('typing', (conversationId: unknown) => {
      if (typeof conversationId === 'string' && socket.rooms.has(`conv:${conversationId}`)) {
        socket.to(`conv:${conversationId}`).emit('typing', { conversationId, userId });
      }
    });
  });

  return io;
}

export function emitToUser(userId: string | { toString(): string }, event: string, payload: unknown) {
  io?.to(`user:${String(userId)}`).emit(event, payload);
}

export function emitToUsers(userIds: (string | { toString(): string })[], event: string, payload: unknown) {
  if (!io || userIds.length === 0) return;
  io.to(userIds.map((u) => `user:${String(u)}`)).emit(event, payload);
}

export function getIO(): Server | null {
  return io;
}
