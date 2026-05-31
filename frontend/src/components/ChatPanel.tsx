import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { Channel, CurrentUser, Member, Message, VoiceRoom, Attachment } from '../types';
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
  onSendMessage: (value: string, parentId?: string | null, attachment?: Attachment | null) => Promise<void>;
  onJoinVoice: (channelId: string) => Promise<VoiceRoom>;
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragCounter = useRef(0);

  const [draft, setDraft] = useState('');
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
  const [attachedFile, setAttachedFile] = useState<Attachment | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

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

  const processFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      alert('Datei ist zu groß! Maximale Dateigröße ist 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        setAttachedFile({
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          dataUrl,
        });
      }
    };
    reader.onerror = () => {
      alert('Fehler beim Lesen der Datei.');
    };
    reader.readAsDataURL(file);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      processFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const handleSend = async () => {
    const clean = draft.trim();
    if (!clean && !attachedFile) return;
    await onSendMessage(clean, replyingToMessage?.id || null, attachedFile);
    setDraft('');
    setReplyingToMessage(null);
    setAttachedFile(null);
  };

  const renderMessage = (message: Message) => {
    const parentMessage = message.parentId ? messages.find((m) => m.id === message.parentId) : null;
    const attachment = message.attachment;
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
          {message.content && <Markdown content={message.content} />}
          {attachment && (
            <div className="message-attachment">
              {attachment.type.startsWith('image/') ? (
                <div className="message-attachment-image-container">
                  <img
                    src={attachment.dataUrl}
                    className="message-attachment-image"
                    alt={attachment.name}
                    onClick={() => setLightboxUrl(attachment.dataUrl)}
                  />
                  <div className="image-attachment-meta">
                    {attachment.name} ({(attachment.size / 1024 / 1024).toFixed(2)} MB)
                  </div>
                </div>
              ) : (
                <a
                  href={attachment.dataUrl}
                  download={attachment.name}
                  className="message-attachment-file-card"
                  title="Klicken zum Herunterladen"
                >
                  <div className="file-card-icon">📄</div>
                  <div className="file-card-info">
                    <strong>{attachment.name}</strong>
                    <span>{(attachment.size / 1024).toFixed(1)} KB · Herunterladen</span>
                  </div>
                  <div className="file-card-download-icon">⬇</div>
                </a>
              )}
            </div>
          )}
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
    <section 
      className={`conversation ${isDragging ? 'dragging' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="drag-drop-overlay">
          <div className="drag-drop-zone">
            <div className="drag-icon">📎</div>
            <h3>Datei hier ablegen</h3>
            <p className="helper">Bilder oder Dokumente bis zu 5 MB</p>
          </div>
        </div>
      )}

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
        
        {attachedFile && (
          <div className="attachment-preview-banner">
            <div className="attachment-preview-info">
              {attachedFile.type.startsWith('image/') ? (
                <img src={attachedFile.dataUrl} className="attachment-preview-thumb" alt="Preview" />
              ) : (
                <div className="attachment-preview-icon">📄</div>
              )}
              <div className="attachment-preview-details">
                <strong>{attachedFile.name}</strong>
                <span>{(attachedFile.size / 1024 / 1024).toFixed(2)} MB</span>
              </div>
            </div>
            <button className="icon-button compact" onClick={() => setAttachedFile(null)} title="Entfernen">
              ✕
            </button>
          </div>
        )}

        <div className="composer-row">
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
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
            <button 
              className="icon-button" 
              aria-label="Datei anhängen" 
              title="Datei anhängen"
              onClick={() => fileInputRef.current?.click()}
            >
              📎
            </button>
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

      {lightboxUrl && (
        <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={lightboxUrl} alt="Zoomed view" />
            <button className="lightbox-close" onClick={() => setLightboxUrl(null)}>✕</button>
          </div>
        </div>
      )}
    </section>
  );
}

export const ChatPanel = memo(ChatPanelComponent);
