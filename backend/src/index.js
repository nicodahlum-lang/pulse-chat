import express from 'express';
import http from 'node:http';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import {
  appendVoiceActivity,
  createChannel,
  createMessage,
  createServer,
  getChannelMap,
  getBootstrapState,
  getMemberMap,
  joinVoiceRoom,
  loadState,
  leaveVoiceRoom,
  removeVoiceParticipant,
  loginAccount,
  logoutAccount,
  registerAccount,
  resetState,
  sanitizeText,
  setVoiceSpeaker,
  getOrCreateDMChannel,
  toggleReaction,
  updateUserStatus,
  registerMember,
} from './store.js';

const PORT = Number(process.env.PORT ?? 5001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
const typingByChannel = new Map();

function getSessionToken(req) {
  const bearer = req.header('authorization');
  if (bearer?.startsWith('Bearer ')) {
    return bearer.slice(7).trim();
  }
  return req.header('x-session-token')?.trim() ?? '';
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN || true,
    credentials: true,
  },
});

app.use(cors({ origin: CLIENT_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.disable('x-powered-by');

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, service: 'pulse-chat-backend', timestamp: new Date().toISOString() });
});

app.get('/api/bootstrap', async (req, res) => {
  const snapshot = await loadState();
  res.json(getBootstrapState(snapshot, { sessionToken: getSessionToken(req), legacyUserId: req.query.userId }));
});

app.get('/api/state', async (req, res) => {
  const snapshot = await loadState();
  res.json(getBootstrapState(snapshot, { sessionToken: getSessionToken(req), legacyUserId: req.query.userId }));
});

app.post('/api/register', async (req, res) => {
  try {
    const name = sanitizeText(req.body?.name, 42);
    const role = sanitizeText(req.body?.role, 32);
    const avatarFrom = sanitizeText(req.body?.avatarFrom, 24);
    const avatarTo = sanitizeText(req.body?.avatarTo, 24);
    
    if (!name) throw new Error('Name is required');
    const member = await registerMember({ name, role, avatarFrom, avatarTo });
    res.status(201).json(member);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const result = await registerAccount({
      name: sanitizeText(req.body?.name, 42),
      username: sanitizeText(req.body?.username, 32),
      email: sanitizeText(req.body?.email, 120),
      password: String(req.body?.password ?? ''),
      role: sanitizeText(req.body?.role, 32),
      avatarFrom: sanitizeText(req.body?.avatarFrom, 24),
      avatarTo: sanitizeText(req.body?.avatarTo, 24),
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await loginAccount({
      identifier: sanitizeText(req.body?.identifier, 120),
      password: String(req.body?.password ?? ''),
    });
    res.status(200).json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const token = getSessionToken(req);
    await logoutAccount(token);
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/servers', async (req, res) => {
  try {
    const serverRecord = await createServer({
      name: sanitizeText(req.body?.name, 42) || 'New Space',
      icon: sanitizeText(req.body?.icon, 4) || '◌',
      accent: sanitizeText(req.body?.accent, 24) || '#7c9cff',
      description: sanitizeText(req.body?.description, 120),
    });
    res.status(201).json(serverRecord);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/channels', async (req, res) => {
  try {
    const channel = await createChannel({
      serverId: sanitizeText(req.body?.serverId, 64),
      name: sanitizeText(req.body?.name, 48),
      type: req.body?.type === 'voice' ? 'voice' : 'text',
      topic: sanitizeText(req.body?.topic, 120),
    });
    res.status(201).json(channel);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    const message = await createMessage({
      channelId: sanitizeText(req.body?.channelId, 64),
      userId: sanitizeText(req.body?.userId, 64) || 'me',
      content: sanitizeText(req.body?.content, 1000),
      parentId: sanitizeText(req.body?.parentId, 64) || null,
      attachment: req.body?.attachment || null,
    });
    clearTyping(message.channelId, message.userId);
    io.emit('message:new', message);
    res.status(201).json(message);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/messages/:messageId/reactions', async (req, res) => {
  try {
    const messageId = req.params.messageId;
    const emoji = sanitizeText(req.body?.emoji, 16);
    const userId = sanitizeText(req.body?.userId, 64) || 'me';
    if (!emoji) throw new Error('Emoji is required');
    
    const updatedMessage = await toggleReaction({ messageId, emoji, userId });
    io.emit('message:update', updatedMessage);
    res.status(200).json(updatedMessage);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/dm', async (req, res) => {
  try {
    const userId1 = sanitizeText(req.body?.userId1, 64) || 'me';
    const userId2 = sanitizeText(req.body?.userId2, 64);
    if (!userId2) throw new Error('Partner userId is required');
    
    const channel = await getOrCreateDMChannel({ userId1, userId2 });
    res.status(201).json(channel);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/voice/join', async (req, res) => {
  try {
    const channelId = sanitizeText(req.body?.channelId, 64);
    const userId = sanitizeText(req.body?.userId, 64) || 'me';
    const room = await joinVoiceRoom({ channelId, userId });
    io.emit('voice:state', { channelId, room });
    res.status(200).json(room);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/voice/leave', async (req, res) => {
  try {
    const channelId = sanitizeText(req.body?.channelId, 64);
    const userId = sanitizeText(req.body?.userId, 64) || 'me';
    const room = await removeVoiceParticipant(channelId, userId);
    io.emit('voice:state', { channelId, room });
    res.status(200).json(room);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/admin/reset', async (_req, res) => {
  const snapshot = await resetState();
  io.emit('state:reset', getPublicState(snapshot));
  res.json({ ok: true });
});

app.get('/api', (_req, res) => {
  res.json({
    ok: true,
    service: 'pulse-chat-backend',
    mode: process.env.NODE_ENV ?? 'development',
  });
});

app.get('/api/channels/:channelId/messages', async (req, res) => {
  const snapshot = await loadState();
  const channel = getChannelMap(snapshot).get(req.params.channelId);
  if (!channel) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }
  const messages = snapshot.messages.filter((message) => message.channelId === channel.id);
  const members = getMemberMap(snapshot);
  res.json({
    channel,
    messages: messages.map((message) => ({
      ...message,
      authorName: message.userId === snapshot.currentUser.id ? snapshot.currentUser.name : members.get(message.userId)?.name ?? message.userId,
    })),
  });
});

app.get('/api/servers/:serverId/members', async (req, res) => {
  const snapshot = await loadState();
  const server = snapshot.servers.find((item) => item.id === req.params.serverId);
  if (!server) {
    res.status(404).json({ error: 'Server not found' });
    return;
  }
  const members = snapshot.members.filter((member) => member.serverId === server.id);
  res.json({ server, members });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(frontendDist, { extensions: ['html'] }));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      next();
      return;
    }
    res.sendFile(path.join(frontendDist, 'index.html'), (error) => {
      if (error) next(error);
    });
  });
}

app.use((error, _req, res, _next) => {
  res.status(500).json({ error: error.message ?? 'Unexpected error' });
});

io.on('connection', (socket) => {
  socket.data.joinedChannels = new Set();

  socket.on('typing:update', ({ channelId, userId, isTyping }) => {
    if (!channelId) return;
    setTyping(channelId, userId ?? socket.data.userId ?? 'me', Boolean(isTyping));
    io.emit('typing:update', {
      channelId,
      users: getTypingUsers(channelId),
    });
  });

  socket.on('join:channel', async ({ channelId, userId }) => {
    if (!channelId) return;
    socket.join(`channel:${channelId}`);
    socket.data.joinedChannels.add(channelId);
    socket.data.channelId = channelId;
    const uid = userId ?? 'me';
    socket.data.userId = uid;
    socket.join(`user:${uid}`);

    const snapshot = await loadState();
    const room = snapshot.voiceRooms[channelId];
    if (room && room.participants.includes(uid)) {
      // User is already a participant (e.g. joined via HTTP API first).
      // Emit the state back to just this socket to confirm subscription.
      socket.emit('voice:state', { channelId, room });
    } else {
      // Perform the join operation and broadcast the state to everyone.
      const newRoom = await joinVoiceRoom({ channelId, userId: uid });
      io.emit('voice:state', { channelId, room: newRoom });
    }
  });

  socket.on('voice:signal', ({ channelId, toUserId, fromUserId, signal }) => {
    if (!channelId || !toUserId || !signal) return;
    if (!socket.data.joinedChannels?.has(channelId)) return;
    io.to(`user:${toUserId}`).emit('voice:signal', {
      channelId,
      fromUserId: fromUserId ?? socket.data.userId ?? 'me',
      signal,
    });
  });

  socket.on('voice:chunk', async ({ channelId, userId, chunk, mimeType, speaking = true, volume = 0 }) => {
    if (!channelId || !chunk) return;
    const room = await setVoiceSpeaker({ channelId, userId: userId ?? socket.data.userId ?? 'me', speaking });
    await appendVoiceActivity({ channelId, userId: userId ?? socket.data.userId ?? 'me', label: 'Voice läuft' });
    socket.to(`channel:${channelId}`).emit('voice:chunk', {
      channelId,
      userId: userId ?? socket.data.userId ?? 'me',
      chunk,
      mimeType,
      room,
      volume,
    });
    io.emit('voice:state', { channelId, room });
  });

  socket.on('user:status:update', async ({ userId, status, activity }) => {
    const uid = userId || socket.data.userId || 'me';
    const result = await updateUserStatus({ userId: uid, status, activity });
    io.emit('user:status:update', { userId: uid, status, activity, members: result.members });
  });

  socket.on('voice:stop', async ({ channelId, userId }) => {
    if (!channelId) return;
    const room = await setVoiceSpeaker({ channelId, userId: userId ?? socket.data.userId ?? 'me', speaking: false });
    io.emit('voice:state', { channelId, room });
  });

  socket.on('leave:channel', async ({ channelId, userId }) => {
    if (!channelId) return;
    socket.leave(`channel:${channelId}`);
    socket.data.joinedChannels.delete(channelId);
    const room = await removeVoiceParticipant(channelId, userId ?? socket.data.userId ?? 'me');
    io.emit('voice:state', { channelId, room });
  });

  socket.on('disconnect', async () => {
    const userId = socket.data.userId ?? 'me';
    const joinedChannels = Array.from(socket.data.joinedChannels ?? []);
    for (const channelId of joinedChannels) {
      const room = await removeVoiceParticipant(channelId, userId);
      io.emit('voice:state', { channelId, room });
    }
    for (const channelId of joinedChannels) {
      clearTyping(channelId, userId);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Pulse Chat backend listening on http://localhost:${PORT}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  io.close(() => {
    server.close(() => {
      process.exit(0);
    });
  });
  setTimeout(() => process.exit(1), 25_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

function setTyping(channelId, userId, isTyping) {
  if (!channelId || !userId) return;
  const current = typingByChannel.get(channelId) ?? new Set();
  if (isTyping) {
    current.add(userId);
  } else {
    current.delete(userId);
  }
  if (current.size === 0) {
    typingByChannel.delete(channelId);
    return;
  }
  typingByChannel.set(channelId, current);
}

function clearTyping(channelId, userId) {
  const current = typingByChannel.get(channelId);
  if (!current) return;
  current.delete(userId);
  if (current.size === 0) {
    typingByChannel.delete(channelId);
  }
  io.emit('typing:update', {
    channelId,
    users: getTypingUsers(channelId),
  });
}

function getTypingUsers(channelId) {
  return Array.from(typingByChannel.get(channelId) ?? []);
}
