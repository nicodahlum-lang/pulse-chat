import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import { createChannel, createMessage, createServer, getBootstrap, joinVoiceRoom, leaveVoiceRoom, getOrCreateDM, toggleReaction, registerMember } from './api';
import type { BootstrapPayload, Message, VoiceRoom, Presence, Member } from './types';
import { ChannelSidebar } from './components/ChannelSidebar';
import { ChatPanel } from './components/ChatPanel';
import { CreateChannelModal } from './components/CreateChannelModal';
import { CreateServerModal } from './components/CreateServerModal';
import { InspectorPanel } from './components/InspectorPanel';
import { ServerRail } from './components/ServerRail';
import { LoginModal } from './components/LoginModal';

function mergeMessage(existing: Message[], incoming: Message) {
  if (existing.some((message) => message.id === incoming.id)) {
    return existing;
  }
  return [...existing, incoming];
}

function getSocketUrl() {
  if (typeof window === 'undefined') {
    return 'http://localhost:5001';
  }
  const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  return isLocalHost ? 'http://localhost:5001' : window.location.origin;
}

interface ServerToClientEvents {
  'message:new': (message: Message) => void;
  'voice:state': (payload: { channelId: string; room: VoiceRoom }) => void;
  'state:reset': (payload: BootstrapPayload) => void;
  'voice:chunk': (payload: { chunk: ArrayBuffer; mimeType: string; userId: string; channelId: string; volume?: number }) => void;
  'voice:signal': (payload: { channelId: string; fromUserId: string; signal: { type: 'offer' | 'answer'; sdp: RTCSessionDescriptionInit } | { type: 'ice-candidate'; candidate: RTCIceCandidateInit } }) => void;
  'typing:update': (payload: { channelId: string; users: string[] }) => void;
  'message:update': (message: Message) => void;
  'user:status:update': (payload: { userId: string; status: Presence; activity: string; members: Member[] }) => void;
}

interface ClientToServerEvents {
  'join:channel': (payload: { channelId: string; userId: string }) => void;
  'voice:chunk': (payload: { channelId: string; userId: string; chunk: ArrayBuffer; mimeType: string; speaking: boolean; volume?: number }) => void;
  'voice:signal': (payload: { channelId: string; toUserId: string; fromUserId: string; signal: { type: 'offer' | 'answer'; sdp: RTCSessionDescriptionInit } | { type: 'ice-candidate'; candidate: RTCIceCandidateInit } }) => void;
  'voice:stop': (payload: { channelId: string; userId: string }) => void;
  'leave:channel': (payload: { channelId: string; userId: string }) => void;
  'typing:update': (payload: { channelId: string; userId: string; isTyping: boolean }) => void;
}

export default function App() {
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const bootRef = useRef<BootstrapPayload | null>(null);
  const selectedChannelRef = useRef<string>('');
  const [boot, setBoot] = useState<BootstrapPayload | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<string>('');
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [socketState, setSocketState] = useState<'offline' | 'connecting' | 'online'>('connecting');
  const [searchQuery, setSearchQuery] = useState('');
  const [typingByChannel, setTypingByChannel] = useState<Record<string, string[]>>({});
  const typingTimeoutRef = useRef<number | null>(null);
  const lastTypingEmittedRef = useRef<boolean>(false);
  const lastTypingTimeRef = useRef<number>(0);

  const [userId, setUserId] = useState<string | null>(localStorage.getItem('pulse_chat_user_id'));

  useEffect(() => {
    let active = true;
    setLoading(true);

    getBootstrap(userId || undefined)
      .then((payload) => {
        if (!active) return;
        bootRef.current = payload;
        setBoot(payload);

        if (userId && !payload.members.some(m => m.id === userId) && payload.currentUser.id !== userId) {
          console.warn("User ID not found in members, clearing local selection.");
          localStorage.removeItem('pulse_chat_user_id');
          setUserId(null);
        }

        setSelectedServerId((current) => current || payload.servers[0]?.id || '');
        const initialServer = payload.servers[0];
        const initialChannel = payload.channels.find((channel) => channel.serverId === initialServer?.id);
        setSelectedChannelId((current) => current || initialChannel?.id || '');
        setLoading(false);
      })
      .catch((requestError: Error) => {
        if (!active) return;
        setError(requestError.message);
        setLoading(false);
      });

    const socket = io(getSocketUrl()) as Socket<ServerToClientEvents, ClientToServerEvents>;
    socketRef.current = socket;
    setSocketState('connecting');

    socket.on('connect', () => setSocketState('online'));
    socket.on('disconnect', () => setSocketState('offline'));

    socket.on('message:new', (incoming: Message) => {
      setBoot((current) => {
        if (!current) return current;
        return {
          ...current,
          messages: mergeMessage(current.messages, incoming),
        };
      });
      if (bootRef.current) {
        bootRef.current = {
          ...bootRef.current,
          messages: mergeMessage(bootRef.current.messages, incoming),
        };
      }
    });

    socket.on('voice:state', ({ channelId, room }: { channelId: string; room: VoiceRoom }) => {
      setBoot((current) => {
        if (!current) return current;
        return {
          ...current,
          voiceRooms: {
            ...current.voiceRooms,
            [channelId]: room,
          },
        };
      });
      if (bootRef.current) {
        bootRef.current = {
          ...bootRef.current,
          voiceRooms: {
            ...bootRef.current.voiceRooms,
            [channelId]: room,
          },
        };
      }
    });

    socket.on('state:reset', (payload: BootstrapPayload) => {
      bootRef.current = payload;
      setBoot(payload);
      setSelectedServerId(payload.servers[0]?.id || '');
      const firstChannel = payload.channels.find((channel) => channel.serverId === payload.servers[0]?.id);
      selectedChannelRef.current = firstChannel?.id || '';
      setSelectedChannelId(firstChannel?.id || '');
    });

    socket.on('voice:chunk', async ({ chunk, mimeType, userId: speakUid, channelId }: { chunk: ArrayBuffer; mimeType: string; userId: string; channelId: string }) => {
      const currentChannel = bootRef.current?.channels.find((item) => item.id === selectedChannelRef.current);
      if (!currentChannel || currentChannel.id !== channelId) return;
      if (speakUid === bootRef.current?.currentUser.id) return;

      const audioContext = audioCtxRef.current ?? new AudioContext();
      audioCtxRef.current = audioContext;
      const blob = new Blob([chunk], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      let revoked = false;
      const cleanup = () => {
        if (!revoked) {
          revoked = true;
          URL.revokeObjectURL(url);
          audio.remove();
        }
      };

      audio.onended = cleanup;
      audio.onerror = cleanup;

      try {
        await audio.play();
        await audioContext.resume();
      } catch (err) {
        console.warn('Playback of voice chunk failed:', err);
        cleanup();
      }
    });

    socket.on('typing:update', ({ channelId, users }) => {
      setTypingByChannel((current) => ({
        ...current,
        [channelId]: users,
      }));
    });

    socket.on('message:update', (updated: Message) => {
      setBoot((current) => {
        if (!current) return current;
        return {
          ...current,
          messages: current.messages.map((m) => (m.id === updated.id ? updated : m)),
        };
      });
      if (bootRef.current) {
        bootRef.current = {
          ...bootRef.current,
          messages: bootRef.current.messages.map((m) => (m.id === updated.id ? updated : m)),
        };
      }
    });

    socket.on('user:status:update', ({ userId: statusUid, status, activity, members }) => {
      setBoot((current) => {
        if (!current) return current;
        const nextCurrentUser = statusUid === current.currentUser.id || statusUid === 'me'
          ? { ...current.currentUser, status, activity }
          : current.currentUser;
        return {
          ...current,
          currentUser: nextCurrentUser,
          members: members || current.members.map((m) => (m.id === statusUid ? { ...m, status, activity } : m)),
        };
      });
      if (bootRef.current) {
        const nextCurrentUser = statusUid === bootRef.current.currentUser.id || statusUid === 'me'
          ? { ...bootRef.current.currentUser, status, activity }
          : bootRef.current.currentUser;
        bootRef.current = {
          ...bootRef.current,
          currentUser: nextCurrentUser,
          members: members || bootRef.current.members.map((m) => (m.id === statusUid ? { ...m, status, activity } : m)),
        };
      }
    });

    return () => {
      active = false;
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
      }
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userId]);

  const currentServer = useMemo(() => boot?.servers.find((server) => server.id === selectedServerId) ?? null, [boot?.servers, selectedServerId]);
  const serverChannels = useMemo(() => {
    if (selectedServerId === 'dms') {
      return boot?.channels.filter((channel) => channel.type === 'dm') ?? [];
    }
    return boot?.channels.filter((channel) => channel.serverId === currentServer?.id) ?? [];
  }, [boot?.channels, currentServer?.id, selectedServerId]);
  const currentChannel = useMemo(
    () => serverChannels.find((channel) => channel.id === selectedChannelId) ?? null,
    [selectedChannelId, serverChannels],
  );
  const currentMessages = useMemo(
    () => boot?.messages.filter((message) => message.channelId === currentChannel?.id) ?? [],
    [boot?.messages, currentChannel?.id],
  );
  const visibleMessages = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return currentMessages;
    return currentMessages.filter((message) => {
      const authorName = message.userId === boot?.currentUser.id
        ? boot?.currentUser.name ?? message.userId
        : boot?.members.find((member) => member.id === message.userId)?.name ?? message.userId;
      return [message.content, authorName].some((value) => value.toLowerCase().includes(query));
    });
  }, [boot?.currentUser.id, boot?.currentUser.name, boot?.members, currentMessages, searchQuery]);
  const voiceRoom = boot?.voiceRooms[currentChannel?.id ?? ''] ?? { participants: [], activeSpeakerId: null, lastSpeakingAt: null };
  const currentMembers = useMemo(() => {
    if (selectedServerId === 'dms') {
      return boot?.members ?? [];
    }
    return boot?.members.filter((member) => member.serverId === currentServer?.id) ?? [];
  }, [boot?.members, currentServer?.id, selectedServerId]);

  useEffect(() => {
    if (!boot) return;
    if (selectedServerId === 'dms') {
      const firstDM = boot.channels.find((channel) => channel.type === 'dm');
      if (firstDM && !serverChannels.some((channel) => channel.id === selectedChannelId)) {
        selectedChannelRef.current = firstDM.id;
        setSelectedChannelId(firstDM.id);
      }
    } else if (currentServer) {
      const firstChannelInServer = boot.channels.find((channel) => channel.serverId === currentServer.id);
      if (firstChannelInServer && !serverChannels.some((channel) => channel.id === selectedChannelId)) {
        selectedChannelRef.current = firstChannelInServer.id;
        setSelectedChannelId(firstChannelInServer.id);
      }
    }
  }, [boot, currentServer, selectedServerId, selectedChannelId, serverChannels]);

  useEffect(() => {
    selectedChannelRef.current = selectedChannelId;
    setSearchQuery('');
  }, [selectedChannelId]);

  useEffect(() => {
    if (!currentChannel || (currentChannel.type !== 'text' && currentChannel.type !== 'dm')) return;
    setTypingByChannel((current) => {
      if (!current[currentChannel.id]?.length) return current;
      return { ...current, [currentChannel.id]: current[currentChannel.id].filter((userId) => userId !== boot?.currentUser.id) };
    });
  }, [boot?.currentUser.id, currentChannel]);

  const handleTypingChange = useCallback(
    (isTyping: boolean) => {
      if (!currentChannel || (currentChannel.type !== 'text' && currentChannel.type !== 'dm') || !boot) return;
      const socket = socketRef.current;
      if (!socket) return;

      const now = Date.now();
      const shouldEmit = isTyping 
        ? (!lastTypingEmittedRef.current || now - lastTypingTimeRef.current > 2000)
        : lastTypingEmittedRef.current;

      if (shouldEmit) {
        socket.emit('typing:update', {
          channelId: currentChannel.id,
          userId: boot.currentUser.id,
          isTyping,
        });
        lastTypingEmittedRef.current = isTyping;
        lastTypingTimeRef.current = isTyping ? now : 0;
      }

      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }

      if (isTyping) {
        typingTimeoutRef.current = window.setTimeout(() => {
          socket.emit('typing:update', {
            channelId: currentChannel.id,
            userId: boot.currentUser.id,
            isTyping: false,
          });
          lastTypingEmittedRef.current = false;
          lastTypingTimeRef.current = 0;
        }, 3000);
      }
    },
    [boot, currentChannel],
  );

  const handleSendMessage = useCallback(
    async (content: string, parentId?: string | null) => {
      if (!currentChannel || currentChannel.type === 'voice' || !boot) return;
      const clean = content.trim();
      if (!clean) return;
      const message = await createMessage({
        channelId: currentChannel.id,
        content: clean,
        userId: boot.currentUser.id,
        parentId: parentId || null,
      });
      setBoot((current) => {
        if (!current) return current;
        return { ...current, messages: mergeMessage(current.messages, message) };
      });
      if (bootRef.current) {
        bootRef.current = {
          ...bootRef.current,
          messages: mergeMessage(bootRef.current.messages, message),
        };
      }
      handleTypingChange(false);
    },
    [boot, currentChannel, handleTypingChange],
  );

  const handleToggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!boot) return;
    try {
      const updated = await toggleReaction(messageId, emoji, boot.currentUser.id);
      setBoot((current) => {
        if (!current) return current;
        return {
          ...current,
          messages: current.messages.map((m) => (m.id === updated.id ? updated : m)),
        };
      });
      if (bootRef.current) {
        bootRef.current = {
          ...bootRef.current,
          messages: bootRef.current.messages.map((m) => (m.id === updated.id ? updated : m)),
        };
      }
    } catch (err) {
      console.error('Failed to toggle reaction', err);
    }
  }, [boot]);

  const handleSelectUserDM = useCallback(async (partnerId: string) => {
    if (!boot) return;
    try {
      const channel = await getOrCreateDM(boot.currentUser.id, partnerId);
      setBoot((current) => {
        if (!current) return current;
        if (current.channels.some((c) => c.id === channel.id)) return current;
        return {
          ...current,
          channels: [channel, ...current.channels],
        };
      });
      if (bootRef.current) {
        if (!bootRef.current.channels.some((c) => c.id === channel.id)) {
          bootRef.current.channels = [channel, ...bootRef.current.channels];
        }
      }
      setSelectedChannelId(channel.id);
      selectedChannelRef.current = channel.id;
    } catch (err) {
      console.error('Failed to open DM channel', err);
    }
  }, [boot]);

  const handleChangeStatus = useCallback((status: Presence, activity: string) => {
    const socket = socketRef.current;
    if (!socket || !boot) return;
    socket.emit('user:status:update' as any, {
      userId: boot.currentUser.id,
      status,
      activity,
    });
  }, [boot]);

  const handleCreateServer = useCallback(async (input: { name: string; icon: string; accent: string; description: string }) => {
    const created = await createServer(input);
    setBoot((current) => {
      if (!current) return current;
      return { ...current, servers: [created, ...current.servers] };
    });
    if (bootRef.current) {
      bootRef.current = { ...bootRef.current, servers: [created, ...bootRef.current.servers] };
    }
    setSelectedServerId(created.id);
    setChannelModalOpen(true);
  }, []);

  const handleCreateChannel = useCallback(
    async (input: { serverId: string; name: string; type: 'text' | 'voice'; topic: string }) => {
      const created = await createChannel(input);
      setBoot((current) => {
        if (!current) return current;
        return {
          ...current,
          channels: [created, ...current.channels],
          voiceRooms:
            created.type === 'voice'
              ? { ...current.voiceRooms, [created.id]: { participants: [], activeSpeakerId: null, lastSpeakingAt: null } }
            : current.voiceRooms,
        };
      });
      if (bootRef.current) {
        bootRef.current = {
          ...bootRef.current,
          channels: [created, ...bootRef.current.channels],
          voiceRooms:
            created.type === 'voice'
              ? { ...bootRef.current.voiceRooms, [created.id]: { participants: [], activeSpeakerId: null, lastSpeakingAt: null } }
              : bootRef.current.voiceRooms,
        };
      }
      setSelectedChannelId(created.id);
      selectedChannelRef.current = created.id;
    },
    [],
  );

  const handleJoinVoice = useCallback(
    async (channelId: string) => {
      if (!boot) throw new Error('Workspace not loaded');
      const room = await joinVoiceRoom({ channelId, userId: boot.currentUser.id });
      setBoot((current) => {
        if (!current) return current;
        return {
          ...current,
          voiceRooms: {
            ...current.voiceRooms,
            [channelId]: room,
          },
        };
      });
      if (bootRef.current) {
        bootRef.current = {
          ...bootRef.current,
          voiceRooms: {
            ...bootRef.current.voiceRooms,
            [channelId]: room,
          },
        };
      }
      return room;
    },
    [boot],
  );

  const handleLeaveVoice = useCallback(
    async (channelId: string) => {
      if (!boot) return;
      const room = await leaveVoiceRoom({ channelId, userId: boot.currentUser.id });
      if (room) {
        setBoot((current) => {
          if (!current) return current;
          return {
            ...current,
            voiceRooms: {
              ...current.voiceRooms,
              [channelId]: room,
            },
          };
        });
        if (bootRef.current) {
          bootRef.current = {
            ...bootRef.current,
            voiceRooms: {
              ...bootRef.current.voiceRooms,
              [channelId]: room,
            },
          };
        }
      }
    },
    [boot],
  );

  const handleVoiceChunk = useCallback(
    (channelId: string, chunk: Blob, mimeType: string, speaking: boolean, volume?: number) => {
      const socket = socketRef.current;
      if (!socket || !boot) return;
      selectedChannelRef.current = channelId;
      chunk.arrayBuffer().then((buffer) => {
        socket.emit('voice:chunk', {
          channelId,
          userId: boot.currentUser.id,
          chunk: buffer,
          mimeType,
          speaking,
          volume: volume || 0,
        });
      });
    },
    [boot],
  );

  const channelMismatch = useMemo(() => {
    if (!currentChannel) return false;
    if (selectedServerId === 'dms') {
      return currentChannel.type !== 'dm';
    }
    return currentChannel.serverId !== currentServer?.id;
  }, [currentChannel, selectedServerId, currentServer?.id]);

  if (error) {
    return (
      <div className="login-overlay">
        <div className="login-card" style={{ alignItems: 'center', textAlign: 'center' }}>
          <div className="brand-mark" style={{ margin: '0 auto 16px', background: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>!</div>
          <h3 style={{ fontFamily: 'Space Grotesk', fontSize: '1.4rem', margin: '0 0 8px', color: 'var(--danger)' }}>Server-Fehler</h3>
          <p className="helper" style={{ marginBottom: '16px' }}>{error}</p>
          <button className="action" onClick={() => window.location.reload()}>Verbindung neu aufbauen</button>
        </div>
      </div>
    );
  }

  if (!userId || (boot && !boot.members.some(m => m.id === userId) && boot.currentUser.id !== userId)) {
    if (loading) {
      return (
        <div className="login-overlay">
          <div className="login-card" style={{ alignItems: 'center', textAlign: 'center' }}>
            <div className="brand-mark" style={{ margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>P</div>
            <h3 style={{ fontFamily: 'Space Grotesk', fontSize: '1.4rem', margin: '0 0 8px' }}>Pulse Chat lädt...</h3>
            <p className="helper">Workspace-Verbindung wird initialisiert.</p>
          </div>
        </div>
      );
    }
    return (
      <LoginModal
        members={boot?.members ?? []}
        onLogin={(id) => {
          localStorage.setItem('pulse_chat_user_id', id);
          setUserId(id);
        }}
        onRegister={async (input) => {
          const res = await registerMember(input);
          return res.id;
        }}
      />
    );
  }

  return (
    <div className="app">
      <ServerRail
        currentUser={boot?.currentUser ?? null}
        servers={boot?.servers ?? []}
        selectedServerId={selectedServerId}
        onSelect={setSelectedServerId}
        onCreate={() => setServerModalOpen(true)}
        socketState={socketState}
      />

      <ChannelSidebar
        workspace={boot?.workspace ?? null}
        server={currentServer}
        channels={serverChannels}
        selectedChannelId={selectedChannelId}
        onSelect={setSelectedChannelId}
        onCreateChannel={() => setChannelModalOpen(true)}
        activity={boot?.activity ?? []}
        selectedServerId={selectedServerId}
        members={boot?.members ?? []}
        currentUser={boot?.currentUser ?? null}
        onSelectUserDM={handleSelectUserDM}
      />

      <main className="main">
        <div className="mobile-header">
          <button className="chip" onClick={() => setServerModalOpen(true)}>Neue Gruppe</button>
          <button className="chip" onClick={() => setChannelModalOpen(true)}>Kanal anlegen</button>
        </div>

        <div className="mobile-scroll">
          {(boot?.servers ?? []).map((server) => (
            <button
              key={server.id}
              className={`server-pill ${server.id === selectedServerId ? 'active' : ''}`}
              onClick={() => setSelectedServerId(server.id)}
            >
              <span className="server-dot" style={{ background: server.accent }} />
              {server.name}
            </button>
          ))}
        </div>

        <div className="main-grid">
          <div className="topbar">
            <div className="brand">
              <div className="brand-mark">P</div>
              <div className="brand-copy">
                <h1>Pulse Chat</h1>
                <p>{boot?.workspace.tagline ?? 'Gruppen, Kanäle und Voice-Räume für lokale Teams.'}</p>
              </div>
            </div>
            <div className="toolbar">
              <span className="status-pill">
                <span className={`presence ${socketState === 'online' ? 'online' : socketState === 'connecting' ? 'idle' : 'offline'}`} />
                {socketState === 'online' ? 'Verbunden' : socketState === 'connecting' ? 'Verbindet …' : 'Offline'}
              </span>
              <button className="action secondary" onClick={() => setChannelModalOpen(true)}>Kanal</button>
              <button className="action" onClick={() => setServerModalOpen(true)}>Gruppe</button>
            </div>
          </div>

          <div className="channel-header">
            <div>
              <div className="tiny-pill">#{currentChannel?.type === 'voice' ? 'voice-room' : currentChannel?.name ?? 'general'}</div>
              <h3>{currentChannel?.type === 'voice' ? currentChannel.name : currentChannel?.name ?? 'Kanal auswählen'}</h3>
              <p>{currentChannel?.topic ?? 'Wähle links eine Gruppe und einen Kanal. Text und Voice laufen lokal zusammen in einem Raum.'}</p>
            </div>
            <div className="channel-actions">
              <button className="action secondary" onClick={() => setChannelModalOpen(true)}>Neuer Kanal</button>
              <button className="action secondary" onClick={() => setServerModalOpen(true)}>Neue Gruppe</button>
            </div>
          </div>

          <div className="content">
            <ChatPanel
              channel={currentChannel}
              messages={visibleMessages}
              members={currentMembers}
              currentUser={boot?.currentUser ?? null}
              voiceRoom={voiceRoom}
              serverMismatch={channelMismatch}
              loading={loading}
              error={error}
              onTypingChange={handleTypingChange}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              onSendMessage={handleSendMessage}
              onJoinVoice={handleJoinVoice}
              onLeaveVoice={handleLeaveVoice}
              onVoiceChunk={handleVoiceChunk}
              typingUsers={typingByChannel[currentChannel?.id ?? ''] ?? []}
              socket={socketRef.current}
              onToggleReaction={handleToggleReaction}
            />

            <InspectorPanel
              server={currentServer}
              members={currentMembers}
              activity={boot?.activity ?? []}
              currentUser={boot?.currentUser ?? null}
              voiceRoom={voiceRoom}
              currentChannel={currentChannel}
              onChangeStatus={handleChangeStatus}
            />
          </div>
        </div>
      </main>

      {serverModalOpen && (
        <CreateServerModal
          onClose={() => setServerModalOpen(false)}
          onSubmit={handleCreateServer}
        />
      )}

      {channelModalOpen && (
        <CreateChannelModal
          currentServerId={currentServer?.id ?? boot?.servers[0]?.id ?? ''}
          servers={boot?.servers ?? []}
          onClose={() => setChannelModalOpen(false)}
          onSubmit={handleCreateChannel}
        />
      )}
    </div>
  );
}
