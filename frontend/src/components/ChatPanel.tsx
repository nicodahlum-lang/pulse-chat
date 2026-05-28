import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Channel, CurrentUser, Member, Message, VoiceRoom } from '../types';
import { VoicePanel } from './VoicePanel';
import { Markdown } from './Markdown';

interface Props {
  channel: Channel | null;
  messages: Message[];
  members: Member[];
  currentUser: CurrentUser | null;
  voiceRoom: VoiceRoom;
  serverMismatch: boolean;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  typingUsers: string[];
  onTypingChange: (isTyping: boolean) => void;
  onSearchQueryChange: (value: string) => void;
  onSendMessage: (value: string, parentId?: string | null) => Promise<void>;
  onJoinVoice: (channelId: string) => Promise<void>;
  onLeaveVoice: (channelId: string) => Promise<void>;
  onVoiceChunk: (channelId: string, chunk: Blob, mimeType: string, speaking: boolean) => void;
  socket: any;
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>;
}

function avatarFor(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function messageAuthor(message: Message, members: Member[], currentUser: CurrentUser | null) {
  if (message.userId === currentUser?.id) {
    return currentUser.name;
  }
  return members.find((member) => member.id === message.userId)?.name ?? message.userId;
}

function ChatPanelComponent(props: Props) {
  const { channel, messages, members, currentUser, voiceRoom, serverMismatch, loading, error, searchQuery, typingUsers, onTypingChange, onSearchQueryChange, onSendMessage, onJoinVoice, onLeaveVoice, onVoiceChunk, socket, onToggleReaction } = props;
  const messageRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState('');
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchQueryChange(localSearch);
    }, 250);
    return () => clearTimeout(timer);
  }, [localSearch, onSearchQueryChange]);

  useEffect(() => {
    messageRef.current?.scrollTo({ top: messageRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, channel?.id]);

  const speakerNames = useMemo(() => {
    return voiceRoom.participants
      .map((participantId) => members.find((member) => member.id === participantId)?.name ?? participantId)
      .join(' · ');
  }, [members, voiceRoom.participants]);

  const handleSend = async () => {
    const clean = draft.trim();
    if (!clean) return;
    await onSendMessage(clean, replyingToMessage?.id || null);
    setDraft('');
    setReplyingToMessage(null);
  };

  const renderMessage = (message: Message) => {
    const parentMessage = message.parentId ? messages.find((m) => m.id === message.parentId) : null;
    return (
      <article key={message.id} className={`message ${message.kind === 'system' ? 'system' : ''}`}>
        {parentMessage && (
          <div className="reply-quote">
            <span className="reply-arrow">⤷</span>
            <strong>{parentMessage.userId === currentUser?.id ? currentUser.name : members.find((m) => m.id === parentMessage.userId)?.name ?? parentMessage.userId}</strong>
            <span className="reply-content">{parentMessage.content}</span>
          </div>
        )}
        <div className="message-head">
          <div className="message-author">
            <div className="avatar">{avatarFor(message.userId)}</div>
            <div className="meta-stack">
              <strong>{message.kind === 'system' ? 'System' : messageAuthor(message, members, currentUser)}</strong>
              <span>{new Date(message.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
          <span className="message-time">{channel?.type === 'voice' ? 'Voice' : 'Text'}</span>
        </div>
        
        <div className="message-body">
          <Markdown content={message.content} />
        </div>

        {message.kind !== 'system' && (
          <div className="message-hover-actions">
            <button className="icon-button compact" title="Antworten" onClick={() => setReplyingToMessage(message)}>
              ⤷
            </button>
            <div className="quick-emoji-selector">
              {['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => onToggleReaction(message.id, emoji)}
                  className="quick-emoji-btn"
                  title={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {message.reactions && message.reactions.length > 0 && (
          <div className="reactions-row">
            {message.reactions.map((r, rIdx) => {
              const reactedByMe = currentUser ? r.userIds.includes(currentUser.id) : false;
              return (
                <button
                  key={rIdx}
                  className={`reaction-pill ${reactedByMe ? 'active' : ''}`}
                  onClick={() => onToggleReaction(message.id, r.emoji)}
                  title={`Reagiert von: ${r.userIds.join(', ')}`}
                >
                  <span>{r.emoji}</span>
                  <span className="count">{r.userIds.length}</span>
                </button>
              );
            })}
          </div>
        )}
      </article>
    );
  };

  if (loading) {
    return (
      <section className="conversation">
        <div className="preview-card">
          <h3 className="panel-title">Workspace lädt …</h3>
          <p className="helper">Pulse Chat startet den Seed-Workspace und verbindet den Live-Kanal.</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="conversation">
        <div className="preview-card">
          <h3 className="panel-title">Backend nicht erreichbar</h3>
          <p className="helper">{error}</p>
        </div>
      </section>
    );
  }

  if (!channel || serverMismatch) {
    return (
      <section className="conversation">
        <div className="preview-card">
          <h3 className="panel-title">Wähle einen Kanal</h3>
          <p className="helper">Links eine Gruppe auswählen und dann einen Text-, Voice- oder Direct Message-Kanal öffnen.</p>
        </div>
      </section>
    );
  }

  if (channel.type === 'voice') {
    return (
      <section className="conversation">
        <VoicePanel
          channel={channel}
          currentUser={currentUser}
          voiceRoom={voiceRoom}
          members={members}
          onJoinVoice={onJoinVoice}
          onLeaveVoice={onLeaveVoice}
          onVoiceChunk={onVoiceChunk}
          socket={socket}
        />

        <div className="stack" ref={messageRef}>
          <div className="section-label">Letzte Raum-Notizen</div>
          {messages.map((message) => renderMessage(message))}
        </div>
        <div className="helper" style={{ marginTop: '-4px' }}>
          {typingUsers.length > 0 ? `${typingUsers.join(' · ')} tippt gerade …` : 'Niemand tippt gerade.'}
        </div>
      </section>
    );
  }

  return (
    <section className="conversation">
      <div className="preview-card" style={{ padding: '12px 14px' }}>
        <label htmlFor="message-search" className="helper" style={{ display: 'block', marginBottom: '8px' }}>
          Nachrichten durchsuchen
        </label>
        <input
          id="message-search"
          name="message-search"
          value={localSearch}
          onChange={(event) => setLocalSearch(event.target.value)}
          placeholder="Nach Inhalt oder Absender suchen …"
          style={{ width: '100%' }}
        />
      </div>

      <div className="message-list" ref={messageRef}>
        {messages.length === 0 ? (
          <div className="preview-card">
            <h3 className="panel-title">{searchQuery.trim() ? 'Keine Treffer' : 'Keine Nachrichten hier'}</h3>
            <p className="helper">{searchQuery.trim() ? 'Versuch einen anderen Begriff oder lösche den Filter.' : 'Starte den ersten Impuls und halte die Gruppe lebendig.'}</p>
          </div>
        ) : (
          messages.map((message) => renderMessage(message))
        )}
      </div>

      <div className="composer">
        {replyingToMessage && (
          <div className="reply-banner">
            <div className="reply-banner-info">
              <span>Antwort an <strong>@{messageAuthor(replyingToMessage, members, currentUser)}</strong></span>
              <small className="reply-banner-snippet">{replyingToMessage.content}</small>
            </div>
            <button className="icon-button compact" onClick={() => setReplyingToMessage(null)} title="Abbrechen">
              ✕
            </button>
          </div>
        )}
        <div className="composer-row">
          <textarea
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              onTypingChange(event.target.value.trim().length > 0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            onBlur={() => onTypingChange(false)}
            placeholder={`Nachricht an #${channel.name} senden ...`}
          />
          <div className="composer-actions">
            <button className="icon-button" aria-label="Schnellreaktion" title="Schnellreaktion">
              ✦
            </button>
            <button className="action" onClick={handleSend}>
              Senden
            </button>
          </div>
        </div>
        <div className="helper" style={{ marginTop: '8px' }}>
          Enter sendet deine Nachricht. Shift+Enter fügt einen Zeilenumbruch ein. Sprecher gerade: {speakerNames || 'niemand'}.
        </div>
        <div className="helper" style={{ marginTop: '4px' }}>
          {typingUsers.length > 0 ? `${typingUsers.join(' · ')} tippt gerade …` : 'Niemand tippt gerade.'}
        </div>
      </div>
    </section>
  );
}

export const ChatPanel = memo(ChatPanelComponent);
