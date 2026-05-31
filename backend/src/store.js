import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';

const scryptAsync = promisify(scrypt);

let pool = null;

if (process.env.DATABASE_URL) {
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });
}

async function ensureDbSchema() {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS pulse_chat_state (
        id INT PRIMARY KEY,
        state TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } finally {
    client.release();
  }
}

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
    id: 'guest',
    name: 'Gast',
    handle: '@gast',
    role: 'Gast',
    status: 'offline',
    avatar: {
      type: 'gradient',
      from: '#cccccc',
      to: '#999999',
      label: 'G',
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
  members: [],
  accounts: [],
  sessions: {},
  messages: [],
  voiceRooms: {
    'orbit-voice': {
      participants: [],
      activeSpeakerId: null,
      lastSpeakingAt: null,
    },
    'guild-raids': {
      participants: [],
      activeSpeakerId: null,
      lastSpeakingAt: null,
    },
    'studio-room': {
      participants: [],
      activeSpeakerId: null,
      lastSpeakingAt: null,
    },
  },
  activity: [],
  settings: {
    density: 'compact',
    theme: 'midnight',
  },
};

let state = null;
let writeQueue = Promise.resolve();
const DEMO_CREDENTIALS = [];

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

async function createPasswordDigest(password, salt = randomBytes(16).toString('hex')) {
  const hashBuffer = await scryptAsync(String(password), salt, 64);
  return { salt, hash: hashBuffer.toString('hex') };
}

async function verifyPassword(password, salt, expectedHash) {
  try {
    const actualHash = await scryptAsync(String(password), salt, 64);
    const expectedBuffer = Buffer.from(String(expectedHash), 'hex');
    return actualHash.length === expectedBuffer.length && timingSafeEqual(actualHash, expectedBuffer);
  } catch {
    return false;
  }
}

function normalizeMessageContent(content) {
  return String(content ?? '').trim().replace(/\s+/g, ' ');
}

function ensureDataDir() {
  return mkdir(dataDir, { recursive: true });
}

function ensureSeedState() {
  const snapshot = clone(defaultWorkspace);
  snapshot.accounts = [];
  snapshot.sessions = {};
  return snapshot;
}

function ensureMemberAvatar(member) {
  if (member.avatar) {
    return member;
  }

  const label = (member.name ?? member.handle ?? member.id ?? '?').trim().charAt(0).toUpperCase() || '?';
  const seed = String(member.handle ?? member.id ?? member.name ?? '');
  const palette = [
    ['#9b8cff', '#4dd6ff'],
    ['#34d399', '#3b82f6'],
    ['#f59e0b', '#e11d48'],
    ['#ec4899', '#8b5cf6'],
    ['#10b981', '#059669'],
  ];
  const index = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length;
  const [from, to] = palette[index];
  return {
    ...member,
    avatar: {
      type: 'gradient',
      from,
      to,
      label,
    },
  };
}

function normalizeAccount(account) {
  return {
    ...account,
    username: sanitizeText(account.username, 64).toLowerCase(),
    email: sanitizeText(account.email, 120).toLowerCase(),
  };
}

function normalizeState(snapshot) {
  const next = clone(snapshot ?? ensureSeedState());
  
  const DEMO_USER_IDS = ['mara', 'leo', 'nina', 'tom', 'jules'];
  
  if (Array.isArray(next.accounts)) {
    next.accounts = next.accounts.filter((acc) => !acc.isDemo && !DEMO_USER_IDS.includes(acc.memberId));
  }
  
  if (Array.isArray(next.members)) {
    next.members = next.members.filter((member) => !DEMO_USER_IDS.includes(member.id));
  }

  if (Array.isArray(next.messages)) {
    next.messages = next.messages.filter((msg) => !DEMO_USER_IDS.includes(msg.userId));
  }

  if (next.voiceRooms && typeof next.voiceRooms === 'object') {
    for (const key of Object.keys(next.voiceRooms)) {
      if (Array.isArray(next.voiceRooms[key].participants)) {
        next.voiceRooms[key].participants = next.voiceRooms[key].participants.filter(
          (p) => !DEMO_USER_IDS.includes(p)
        );
      }
      if (DEMO_USER_IDS.includes(next.voiceRooms[key].activeSpeakerId)) {
        next.voiceRooms[key].activeSpeakerId = null;
      }
    }
  }

  next.members = Array.isArray(next.members) ? next.members.map((member) => ensureMemberAvatar(member)) : [];
  next.accounts = Array.isArray(next.accounts) ? next.accounts.map((account) => normalizeAccount(account)) : [];
  next.sessions = next.sessions && typeof next.sessions === 'object' && !Array.isArray(next.sessions) ? next.sessions : {};
  
  next.currentUser = ensureMemberAvatar(next.currentUser ?? defaultWorkspace.currentUser);
  
  if (DEMO_USER_IDS.includes(next.currentUser.id)) {
    next.currentUser = ensureMemberAvatar(defaultWorkspace.currentUser);
  }
  
  return next;
}

function getMemberByAccount(snapshot, account) {
  return snapshot.members.find((member) => member.id === account.memberId) ?? null;
}

function findAccountByIdentifier(snapshot, identifier) {
  const normalized = sanitizeText(identifier, 120).toLowerCase();
  const stripped = normalized.startsWith('@') ? normalized.slice(1) : normalized;
  return snapshot.accounts.find((account) => (
    account.username === stripped ||
    account.email === normalized ||
    account.memberId === stripped
  )) ?? null;
}

function createSession(snapshot, accountId) {
  const token = randomUUID().replace(/-/g, '');
  snapshot.sessions[token] = {
    accountId,
    createdAt: new Date().toISOString(),
  };
  return token;
}

function getSessionTokenFromRequest(req) {
  const bearer = req.header('authorization');
  if (bearer?.startsWith('Bearer ')) {
    return sanitizeText(bearer.slice(7), 128);
  }
  return sanitizeText(req.header('x-session-token') || req.query?.token, 128);
}

function resolveAuthenticatedMember(snapshot, token) {
  if (!token) {
    return null;
  }

  const session = snapshot.sessions[token];
  if (!session) {
    return null;
  }

  const account = snapshot.accounts.find((entry) => entry.id === session.accountId);
  if (!account) {
    return null;
  }

  const member = getMemberByAccount(snapshot, account);
  if (!member) {
    return null;
  }

  return {
    token,
    account,
    member,
  };
}

function buildAuthSnapshot(snapshot, token, legacyUserId) {
  const authenticated = resolveAuthenticatedMember(snapshot, token);
  const legacyMember = !authenticated && legacyUserId
    ? snapshot.members.find((member) => member.id === legacyUserId) ?? null
    : null;
  const currentUser = authenticated?.member ?? legacyMember ?? snapshot.currentUser;
  return {
    currentUser,
    auth: {
      authenticated: Boolean(authenticated),
      userId: authenticated?.member.id ?? null,
    },
  };
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

  if (pool) {
    try {
      await ensureDbSchema();
      const res = await pool.query('SELECT state FROM pulse_chat_state WHERE id = 1');
      if (res.rows.length > 0) {
        state = normalizeState(JSON.parse(res.rows[0].state));
        return state;
      } else {
        state = ensureSeedState();
        const json = JSON.stringify(state);
        await pool.query('INSERT INTO pulse_chat_state (id, state) VALUES (1, $1)', [json]);
        return state;
      }
    } catch (error) {
      console.error('Failed to load state from database, falling back to file:', error);
    }
  }

  const persisted = await readStateFile();
  state = normalizeState(persisted ?? ensureSeedState());
  return state;
}

export async function saveState(nextState) {
  state = normalizeState(nextState);
  const json = JSON.stringify(state);

  if (pool) {
    writeQueue = writeQueue.then(async () => {
      try {
        await pool.query(
          'INSERT INTO pulse_chat_state (id, state, updated_at) VALUES (1, $1, CURRENT_TIMESTAMP) ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = CURRENT_TIMESTAMP',
          [json]
        );
      } catch (error) {
        console.error('Failed to save state to database:', error);
      }
    });
  }

  await ensureDataDir();
  const jsonFormatted = JSON.stringify(state, null, 2);
  writeQueue = writeQueue.then(async () => {
    try {
      await writeFile(tempFile, jsonFormatted, 'utf8');
      await rename(tempFile, stateFile);
    } catch (error) {
      console.error('Failed to write state file:', error);
    }
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
  if (!content && !input.attachment) {
    throw new Error('Message cannot be empty');
  }
  const message = {
    id: compactId('msg'),
    channelId: channel.id,
    userId,
    kind: 'text',
    content: content ? content.slice(0, 1000) : '',
    createdAt: new Date().toISOString(),
    parentId: input.parentId || null,
    reactions: [],
    attachment: input.attachment || null,
  };
  snapshot.messages.push(message);
  pushActivity(snapshot, {
    id: compactId('act'),
    type: 'text',
    title: channel.type === 'dm' ? 'Neue Direktnachricht' : 'Neue Nachricht im Textchat',
    detail: content ? content.slice(0, 80) : `Anhang: ${message.attachment.name}`,
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
  const normalized = normalizeState(snapshot);
  return {
    workspace: normalized.workspace,
    currentUser: normalized.currentUser,
    servers: normalized.servers,
    channels: normalized.channels,
    members: normalized.members,
    messages: normalized.messages,
    voiceRooms: normalized.voiceRooms,
    activity: normalized.activity,
    settings: normalized.settings,
  };
}

export function getBootstrapState(snapshot, { sessionToken, legacyUserId } = {}) {
  const normalized = normalizeState(snapshot);
  const authState = buildAuthSnapshot(normalized, sessionToken, legacyUserId);
  return {
    ...getPublicState(normalized),
    currentUser: authState.currentUser,
    auth: authState.auth,
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

export async function registerMember(input) {
  const snapshot = await loadState();
  const name = String(input.name ?? '').trim().slice(0, 42) || 'Gast';
  const rawId = slugify(name);
  const id = rawId && rawId !== 'new-space' ? rawId : compactId('user');
  const handle = `@${id}`;

  let member = snapshot.members.find((m) => m.id === id || m.handle === handle);
  if (!member) {
    member = {
      id,
      name,
      handle,
      role: String(input.role ?? '').trim().slice(0, 32) || 'Gast',
      status: 'online',
      activity: 'ist beigetreten',
      avatar: {
        type: 'gradient',
        from: String(input.avatarFrom ?? '#4dd6ff'),
        to: String(input.avatarTo ?? '#aa7bff'),
        label: name.charAt(0).toUpperCase() || '?',
      },
    };
    snapshot.members.push(member);
    pushActivity(snapshot, {
      id: compactId('act'),
      type: 'server',
      title: `${name} ist beigetreten`,
      detail: `Neues Mitglied registriert als ${handle}`,
      time: 'Gerade eben',
    });
    await saveState(snapshot);
  }
  return member;
}

export async function registerAccount(input) {
  const snapshot = await loadState();
  const name = sanitizeText(input.name, 42) || 'Gast';
  const role = sanitizeText(input.role, 32) || 'Gast';
  const username = sanitizeText(input.username ?? '', 32).toLowerCase() || slugify(name);
  const email = sanitizeText(input.email, 120).toLowerCase();
  const password = String(input.password ?? '');

  if (!email.includes('@')) {
    throw new Error('Email is required');
  }
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters long');
  }
  if (snapshot.accounts.some((account) => account.email === email || account.username === username)) {
    throw new Error('An account with this email or username already exists');
  }

  const memberId = snapshot.members.some((member) => member.id === username) ? compactId('user') : username;
  const handle = `@${memberId}`;
  const member = {
    id: memberId,
    name,
    handle,
    role,
    status: 'online',
    serverId: 'orbit-hq',
    activity: 'hat sich registriert',
    avatar: input.avatarFrom && input.avatarTo
      ? {
          type: 'gradient',
          from: sanitizeText(input.avatarFrom, 24),
          to: sanitizeText(input.avatarTo, 24),
          label: name.charAt(0).toUpperCase() || '?',
        }
      : undefined,
  };

  const { salt, hash } = await createPasswordDigest(password);
  const account = {
    id: `account-${member.id}`,
    memberId: member.id,
    username,
    email,
    passwordSalt: salt,
    passwordHash: hash,
    isDemo: false,
    createdAt: new Date().toISOString(),
  };

  snapshot.members.push(ensureMemberAvatar(member));
  snapshot.accounts.push(account);
  const token = createSession(snapshot, account.id);
  pushActivity(snapshot, {
    id: compactId('act'),
    type: 'server',
    title: `${member.name} ist beigetreten`,
    detail: `Neues Konto ${account.username} wurde erstellt`,
    time: 'Gerade eben',
  });
  await saveState(snapshot);

  return {
    token,
    user: ensureMemberAvatar(member),
  };
}

export async function loginAccount(input) {
  const snapshot = await loadState();
  const identifier = sanitizeText(input.identifier, 120);
  const password = String(input.password ?? '');
  const account = findAccountByIdentifier(snapshot, identifier);

  if (!account || !(await verifyPassword(password, account.passwordSalt, account.passwordHash))) {
    throw new Error('Invalid login credentials');
  }

  const member = getMemberByAccount(snapshot, account);
  if (!member) {
    throw new Error('Account profile not found');
  }

  const token = createSession(snapshot, account.id);
  await saveState(snapshot);
  return {
    token,
    user: ensureMemberAvatar(member),
  };
}

export async function logoutAccount(token) {
  const snapshot = await loadState();
  if (token && snapshot.sessions[token]) {
    delete snapshot.sessions[token];
    await saveState(snapshot);
  }
  return { ok: true };
}

export { defaultWorkspace as seededWorkspace };
