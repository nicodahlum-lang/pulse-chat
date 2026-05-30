import type { BootstrapPayload, Channel, ChannelType, Message, Server, VoiceRoom } from './types';

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const sessionToken = typeof window !== 'undefined' ? localStorage.getItem('pulse_chat_session_token') : null;
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { 'x-session-token': sessionToken } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getBootstrap(userId?: string) {
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  return fetchJson<BootstrapPayload>(`/api/bootstrap${query}`);
}

export function login(input: { identifier: string; password: string }) {
  return fetchJson<{ token: string; user: any }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function registerAccount(input: { name: string; username: string; email: string; password: string; role?: string; avatarFrom?: string; avatarTo?: string }) {
  return fetchJson<{ token: string; user: any }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function logout() {
  return fetchJson<{ ok: true }>('/api/auth/logout', {
    method: 'POST',
  });
}

export function registerMember(input: { name: string; role: string; avatarFrom?: string; avatarTo?: string }) {
  return fetchJson<{ id: string; name: string; handle: string; role: string; avatar: any }>('/api/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}


export function createServer(input: { name: string; icon: string; accent: string; description: string }) {
  return fetchJson<Server>('/api/servers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createChannel(input: { serverId: string; name: string; type: ChannelType; topic: string }) {
  return fetchJson<Channel>('/api/channels', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createMessage(input: { channelId: string; content: string; userId?: string; parentId?: string | null }) {
  return fetchJson<Message>('/api/messages', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function toggleReaction(messageId: string, emoji: string, userId: string) {
  return fetchJson<Message>(`/api/messages/${messageId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ emoji, userId }),
  });
}

export function getOrCreateDM(userId1: string, userId2: string) {
  return fetchJson<Channel>('/api/dm', {
    method: 'POST',
    body: JSON.stringify({ userId1, userId2 }),
  });
}

export function joinVoiceRoom(input: { channelId: string; userId?: string }) {
  return fetchJson<VoiceRoom>('/api/voice/join', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function leaveVoiceRoom(input: { channelId: string; userId?: string }) {
  return fetchJson<VoiceRoom>('/api/voice/leave', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
