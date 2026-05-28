import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, '..', 'data');
const stateFile = path.join(dataDir, 'state.json');
const tempFile = path.join(dataDir, 'state.json.tmp');

const defaultWorkspace = {
  version: 1,
  workspace: {
    id: 'pulse-lab',
    name: 'Pulse Chat',
    tagline: 'Gruppen, Kanäle und Voice-Räume für lokale Teams.',
  },
  currentUser: {
    id: 'me',
    name: 'Mara',
    handle: '@mara',
    role: 'Product',
    status: 'online',
    avatar: {
      type: 'gradient',
      from: '#9b8cff',
      to: '#4dd6ff',
      label: 'M',
    },
  },
  servers: [
    {
      id: 'orbit-hq',
      name: 'Orbit HQ',
      icon: '◌',
      accent: '#7c9cff',
      description: 'Launches, design reviews und tägliche Standups.',
    },
    {
      id: 'midnight-guild',
      name: 'Midnight Guild',
      icon: '✦',
      accent: '#34d399',
      description: 'Gaming, After Hours und spontane Sprachräume.',
    },
    {
      id: 'signal-studio',
      name: 'Signal Studio',
      icon: '⌁',
      accent: '#f59e0b',
      description: 'Kreative Projekte und Produktionsplanung.',
    },
  ],
  channels: [
    { id: 'orbit-general', serverId: 'orbit-hq', name: 'general', type: 'text', topic: 'Alle Updates an einem Ort.' },
    { id: 'orbit-launch', serverId: 'orbit-hq', name: 'launch', type: 'text', topic: 'Rollouts, QA und Launch-Checks.' },
    { id: 'orbit-rumors', serverId: 'orbit-hq', name: 'random', type: 'text', topic: 'Memes und lockere Themen.' },
    { id: 'orbit-voice', serverId: 'orbit-hq', name: 'War Room', type: 'voice', topic: 'Push-to-talk für schnelle Abstimmungen.' },
    { id: 'guild-general', serverId: 'midnight-guild', name: 'general', type: 'text', topic: 'Community, Posts und Ideen.' },
    { id: 'guild-raids', serverId: 'midnight-guild', name: 'raids', type: 'voice', topic: 'Taktiken, Koordination und Spontanrunden.' },
    { id: 'studio-build', serverId: 'signal-studio', name: 'build', type: 'text', topic: 'Design, Prototypen und Release-Notizen.' },
    { id: 'studio-room', serverId: 'signal-studio', name: 'voice booth', type: 'voice', topic: 'Live-Feedback und Review-Sessions.' },
  ],
  members: [
    { id: 'mara', name: 'Mara Klein', handle: '@mara', role: 'Product', status: 'online', serverId: 'orbit-hq', activity: 'führt ein Launch-Review' },
    { id: 'leo', name: 'Leon', handle: '@leo', role: 'Engineering', status: 'online', serverId: 'orbit-hq', activity: 'arbeitet an Voice-Räumen' },
    { id: 'nina', name: 'Nina', handle: '@nina', role: 'Design', status: 'idle', serverId: 'signal-studio', activity: 'skizziert neue Kanal-Layouts' },
    { id: 'tom', name: 'Tom', handle: '@tom', role: 'Community', status: 'online', serverId: 'midnight-guild', activity: 'moderiert den Abendraum' },
    { id: 'jules', name: 'Jules', handle: '@jules', role: 'Ops', status: 'offline', serverId: 'orbit-hq', activity: 'hat den letzten Huddle archiviert' },
  ],
  messages: [
    {
      id: 'msg-1',
      channelId: 'orbit-general',
      userId: 'leo',
      kind: 'text',
      content: 'Ich habe die neue Channel-Sidebar live. Passt das Tempo für den Wechsel zwischen Gruppen?',
      createdAt: '2026-05-28T07:20:00.000Z',
    },
    {
      id: 'msg-2',
      channelId: 'orbit-general',
      userId: 'mara',
      kind: 'text',
      content: 'Ja, fühlt sich flott an. Lass uns noch einen klareren Voice-Einstieg und eine bessere Member-Rail ergänzen.',
      createdAt: '2026-05-28T07:22:00.000Z',
    },
    {
      id: 'msg-3',
      channelId: 'orbit-launch',
      userId: 'nina',
      kind: 'text',
      content: 'Das Launch-Board braucht noch ein Stück mehr Ruhe im Header, dann ist die Dichte perfekt.',
      createdAt: '2026-05-28T08:10:00.000Z',
    },
    {
      id: 'msg-4',
      channelId: 'orbit-voice',
      userId: 'tom',
      kind: 'system',
      content: 'Tom hat den Voice-Raum betreten.',
      createdAt: '2026-05-28T08:24:00.000Z',
    },
    {
      id: 'msg-5',
      channelId: 'studio-build',
      userId: 'nina',
      kind: 'text',
      content: 'Ich teste gerade eine neue Oberfläche mit einer schwebenden Voice-Konsole. Die Text-Chats fühlen sich dadurch ruhiger an.',
      createdAt: '2026-05-28T08:55:00.000Z',
    },
  ],
  voiceRooms: {
    'orbit-voice': {
      participants: ['mara', 'leo', 'tom'],
      activeSpeakerId: 'leo',
      lastSpeakingAt: '2026-05-28T08:26:00.000Z',
    },
    'guild-raids': {
      participants: ['tom'],
      activeSpeakerId: null,
      lastSpeakingAt: null,
    },
    'studio-room': {
      participants: ['nina'],
      activeSpeakerId: null,
      lastSpeakingAt: null,
    },
  },
  activity: [
    { id: 'act-1', type: 'server', title: 'Orbit HQ ist aktiv', detail: '3 Textkanäle, 1 Voice-Raum', time: 'Vor 12 Min.' },
    { id: 'act-2', type: 'voice', title: 'Leo spricht im War Room', detail: 'Push-to-talk läuft', time: 'Vor 2 Min.' },
    { id: 'act-3', type: 'text', title: 'Nina hat im Build-Channel geschrieben', detail: '1 neue Nachricht', time: 'Gerade eben' },
  ],
  settings: {
    density: 'compact',
    theme: 'midnight',
  },
};

let state = null;
let writeQueue = Promise.resolve();

function clone(value) {
  return structuredClone(value);
}

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'new-space';
}

function compactId(prefix) {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function normalizeMessageContent(content) {
  return String(content ?? '').trim().replace(/\s+/g, ' ');
}

function ensureDataDir() {
  return mkdir(dataDir, { recursive: true });
}

function ensureSeedState() {
  return clone(defaultWorkspace);
}

async function readStateFile() {
  try {
    const raw = await readFile(stateFile, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

export async function loadState() {
  if (state) {
    return state;
  }

  const persisted = await readStateFile();
  state = persisted ?? ensureSeedState();
  return state;
}

export async function saveState(nextState) {
  state = clone(nextState);
  await ensureDataDir();
  const json = JSON.stringify(state, null, 2);
  writeQueue = writeQueue.then(async () => {
    await writeFile(tempFile, json, 'utf8');
    await rename(tempFile, stateFile);
  });
  return writeQueue;
}

export async function resetState() {
  const fresh = ensureSeedState();
  await saveState(fresh);
  return fresh;
}

function pushActivity(snapshot, item) {
  snapshot.activity = [item, ...(snapshot.activity ?? [])].slice(0, 24);
}

export async function createServer(input) {
  const snapshot = await loadState();
  const server = {
    id: compactId('server'),
    name: String(input.name ?? '').trim().slice(0, 42) || 'New Space',
    icon: String(input.icon ?? '◌').slice(0, 4),
    accent: String(input.accent ?? '#7c9cff'),
    description: String(input.description ?? '').trim().slice(0, 120),
  };
  snapshot.servers.unshift(server);
  pushActivity(snapshot, {
    id: compactId('act'),
    type: 'server',
    title: `${server.name} wurde erstellt`,
    detail: 'Neue Gruppe bereit für Kanäle und Voice-Räume.',
    time: 'Gerade eben',
  });
  await saveState(snapshot);
  return server;
}

export async function createChannel(input) {
  const snapshot = await loadState();
  const server = snapshot.servers.find((item) => item.id === input.serverId);
  if (!server) {
    throw new Error('Server not found');
  }
  const type = input.type === 'voice' ? 'voice' : 'text';
  const name = String(input.name ?? '').trim().slice(0, 48) || (type === 'voice' ? 'voice-room' : 'new-channel');
  const channel = {
    id: compactId('channel'),
    serverId: server.id,
    name: type === 'voice' ? name : slugify(name),
    type,
    topic: String(input.topic ?? '').trim().slice(0, 120),
  };
  snapshot.channels.unshift(channel);
  if (type === 'voice') {
    snapshot.voiceRooms[channel.id] = { participants: [], activeSpeakerId: null, lastSpeakingAt: null };
  }
  pushActivity(snapshot, {
    id: compactId('act'),
    type: 'channel',
    title: `${channel.type === 'voice' ? 'Voice-Raum' : 'Kanal'} #${channel.name} erstellt`,
    detail: `Teil von ${server.name}.`,
    time: 'Gerade eben',
  });
  await saveState(snapshot);
  return channel;
}

export async function createMessage(input) {
  const snapshot = await loadState();
  const channel = snapshot.channels.find((item) => item.id === input.channelId && (item.type === 'text' || item.type === 'dm'));
  if (!channel) {
    throw new Error('Text or DM channel not found');
  }
  const userId = input.userId || snapshot.currentUser.id;
  const content = normalizeMessageContent(input.content);
  if (!content) {
    throw new Error('Message cannot be empty');
  }
  const message = {
    id: compactId('msg'),
    channelId: channel.id,
    userId,
    kind: 'text',
    content: content.slice(0, 1000),
    createdAt: new Date().toISOString(),
    parentId: input.parentId || null,
    reactions: [],
  };
  snapshot.messages.push(message);
  pushActivity(snapshot, {
    id: compactId('act'),
    type: 'text',
    title: channel.type === 'dm' ? 'Neue Direktnachricht' : 'Neue Nachricht im Textchat',
    detail: content.slice(0, 80),
    time: 'Gerade eben',
  });
  await saveState(snapshot);
  return message;
}

export async function joinVoiceRoom({ channelId, userId = 'me' }) {
  const snapshot = await loadState();
  const room = snapshot.voiceRooms[channelId] ?? { participants: [], activeSpeakerId: null, lastSpeakingAt: null };
  if (!room.participants.includes(userId)) {
    room.participants = [...room.participants, userId];
  }
  snapshot.voiceRooms[channelId] = room;
  pushActivity(snapshot, {
    id: compactId('act'),
    type: 'voice',
    title: 'Voice-Raum beigetreten',
    detail: `Kanal ${channelId}`,
    time: 'Gerade eben',
  });
  await saveState(snapshot);
  return room;
}

export async function leaveVoiceRoom({ channelId, userId = 'me' }) {
  const snapshot = await loadState();
  const room = snapshot.voiceRooms[channelId];
  if (!room) {
    return null;
  }
  room.participants = room.participants.filter((member) => member !== userId);
  if (room.activeSpeakerId === userId) {
    room.activeSpeakerId = null;
  }
  snapshot.voiceRooms[channelId] = room;
  await saveState(snapshot);
  return room;
}

export async function removeVoiceParticipant(channelId, userId = 'me') {
  const snapshot = await loadState();
  const room = snapshot.voiceRooms[channelId];
  if (!room) {
    return null;
  }
  room.participants = room.participants.filter((member) => member !== userId);
  if (room.activeSpeakerId === userId) {
    room.activeSpeakerId = null;
  }
  snapshot.voiceRooms[channelId] = room;
  await saveState(snapshot);
  return room;
}

export async function setVoiceSpeaker({ channelId, userId, speaking = true }) {
  const snapshot = await loadState();
  const room = snapshot.voiceRooms[channelId] ?? { participants: [], activeSpeakerId: null, lastSpeakingAt: null };
  if (!room.participants.includes(userId)) {
    room.participants = [...room.participants, userId];
  }
  room.activeSpeakerId = speaking ? userId : room.activeSpeakerId === userId ? null : room.activeSpeakerId;
  room.lastSpeakingAt = speaking ? new Date().toISOString() : room.lastSpeakingAt;
  snapshot.voiceRooms[channelId] = room;
  await saveState(snapshot);
  return room;
}

export async function appendVoiceActivity({ channelId, userId, label }) {
  const snapshot = await loadState();
  pushActivity(snapshot, {
    id: compactId('act'),
    type: 'voice',
    title: label ?? 'Voice-Update',
    detail: channelId ? `Kanal ${channelId}` : `Von ${userId}`,
    time: 'Gerade eben',
  });
  await saveState(snapshot);
  return snapshot.activity;
}

export function sanitizeText(input, maxLength = 500) {
  return String(input ?? '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

export function getChannelMap(snapshot) {
  return new Map(snapshot.channels.map((channel) => [channel.id, channel]));
}

export function getMemberMap(snapshot) {
  return new Map(snapshot.members.map((member) => [member.id, member]));
}

export function getPublicState(snapshot) {
  return {
    workspace: snapshot.workspace,
    currentUser: snapshot.currentUser,
    servers: snapshot.servers,
    channels: snapshot.channels,
    members: snapshot.members,
    messages: snapshot.messages,
    voiceRooms: snapshot.voiceRooms,
    activity: snapshot.activity,
    settings: snapshot.settings,
  };
}

export function summarizeServer(snapshot, serverId) {
  const server = snapshot.servers.find((item) => item.id === serverId) ?? null;
  const channels = snapshot.channels.filter((item) => item.serverId === serverId);
  const messages = snapshot.messages.filter((item) => channels.some((channel) => channel.id === item.channelId));
  return {
    server,
    channels,
    messages,
  };
}

export async function getOrCreateDMChannel({ userId1, userId2 }) {
  const snapshot = await loadState();
  const sortedIds = [userId1, userId2].sort();
  const channelId = `dm-${sortedIds.join('-')}`;
  
  let channel = snapshot.channels.find((c) => c.id === channelId);
  if (!channel) {
    const partner = snapshot.members.find((m) => m.id === (userId1 === 'me' ? userId2 : userId1)) || { name: 'Chat-Partner' };
    channel = {
      id: channelId,
      serverId: null,
      name: partner.name,
      type: 'dm',
      memberIds: [userId1, userId2],
      topic: `Privates Gespräch mit ${partner.name}`,
    };
    snapshot.channels.push(channel);
    
    pushActivity(snapshot, {
      id: compactId('act'),
      type: 'text',
      title: `Direktnachricht gestartet`,
      detail: `Gespräch mit ${partner.name}.`,
      time: 'Gerade eben',
    });
    await saveState(snapshot);
  }
  return channel;
}

export async function toggleReaction({ messageId, emoji, userId }) {
  const snapshot = await loadState();
  const message = snapshot.messages.find((msg) => msg.id === messageId);
  if (!message) {
    throw new Error('Message not found');
  }
  if (!message.reactions) {
    message.reactions = [];
  }
  
  const reaction = message.reactions.find((r) => r.emoji === emoji);
  if (reaction) {
    if (reaction.userIds.includes(userId)) {
      reaction.userIds = reaction.userIds.filter((uid) => uid !== userId);
    } else {
      reaction.userIds.push(userId);
    }
  } else {
    message.reactions.push({ emoji, userIds: [userId] });
  }
  
  message.reactions = message.reactions.filter((r) => r.userIds.length > 0);
  
  await saveState(snapshot);
  return message;
}

export async function updateUserStatus({ userId, status, activity }) {
  const snapshot = await loadState();
  if (userId === 'me' || userId === snapshot.currentUser.id) {
    snapshot.currentUser.status = status;
    snapshot.currentUser.activity = activity;
  }
  const member = snapshot.members.find((m) => m.id === userId);
  if (member) {
    member.status = status;
    member.activity = activity;
  }
  await saveState(snapshot);
  return { currentUser: snapshot.currentUser, members: snapshot.members };
}

export { defaultWorkspace as seededWorkspace };
