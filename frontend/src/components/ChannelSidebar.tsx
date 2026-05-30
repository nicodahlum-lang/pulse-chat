import { memo } from 'react';
import type { ActivityItem, Channel, Server, Workspace, CurrentUser, Member } from '../types';

interface Props {
  workspace: Workspace | null;
  server: Server | null;
  channels: Channel[];
  selectedChannelId: string;
  activity: ActivityItem[];
  onSelect: (channelId: string) => void;
  onCreateChannel: () => void;
  selectedServerId: string;
  members: Member[];
  currentUser: CurrentUser | null;
  onSelectUserDM: (userId: string) => void;
  onLogout: () => void;
}

function ChannelSidebarComponent(props: Props) {
  const { workspace, server, channels, selectedChannelId, activity, onSelect, onCreateChannel, selectedServerId, members, currentUser, onSelectUserDM, onLogout } = props;

  if (selectedServerId === 'dms') {
    const activeDMs = channels.filter((c) => c.type === 'dm');
    const otherMembers = members.filter((m) => m.handle !== currentUser?.handle && m.id !== currentUser?.id && m.id !== 'me');

    return (
      <aside className="sidebar">
        <div className="sidebar-content">
          <div className="workspace-title">
            <div>
              <h2>Direktnachrichten</h2>
              <p>Privatchats mit deinem Team.</p>
            </div>
          </div>

          <div className="section-label">Aktive Chats</div>
          {activeDMs.length === 0 ? (
            <p className="helper" style={{ padding: '0 10px', fontSize: '0.8rem', lineHeight: 1.4 }}>
              Keine aktiven Chats. Wähle unten ein Mitglied aus, um zu chatten.
            </p>
          ) : (
            activeDMs.map((channel) => (
              <button
                key={channel.id}
                className={`channel-item ${channel.id === selectedChannelId ? 'active' : ''}`}
                onClick={() => onSelect(channel.id)}
              >
                <span className="name">
                  <span>✉ {channel.name}</span>
                </span>
                <span className="channel-meta">DM</span>
              </button>
            ))
          )}

          <div className="section-label">Mitglieder</div>
          {otherMembers.map((member) => {
            const sortedIds = [currentUser?.id || 'me', member.id].sort();
            const dmChannelId = `dm-${sortedIds.join('-')}`;
            const isSelected = selectedChannelId === dmChannelId;

            return (
              <button
                key={member.id}
                className={`channel-item ${isSelected ? 'active' : ''}`}
                onClick={() => onSelectUserDM(member.id)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span className="name">
                  <span style={{ fontSize: '0.94rem' }}>● {member.name}</span>
                </span>
                <span className={`presence ${member.status}`} style={{ width: '8px', height: '8px' }} />
              </button>
            );
          })}

          <div className="section-label">Aktivität</div>
          {activity.slice(0, 4).map((item) => (
            <div key={item.id} className="group-card" style={{ marginBottom: '10px' }}>
              <div className="tiny-pill">{item.type}</div>
              <h4 style={{ margin: '10px 0 6px', fontSize: '0.98rem' }}>{item.title}</h4>
              <p className="helper" style={{ margin: 0, lineHeight: 1.5 }}>{item.detail}</p>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="user-profile-section">
            <div className="user-profile-avatar-wrapper">
              <div className="user-profile-avatar" style={{ background: 'var(--accent)' }}>
                {currentUser?.name ? currentUser.name.slice(0, 2).toUpperCase() : 'U'}
              </div>
              <span className={`presence ${currentUser?.status ?? 'online'}`} />
            </div>
            <div className="user-profile-info">
              <span className="user-profile-name">{currentUser?.name ?? 'Gast'}</span>
              <span className="user-profile-handle">{currentUser?.handle ?? '@guest'}</span>
            </div>
          </div>
          <button className="icon-button compact logout-btn" title="Abmelden" onClick={onLogout} aria-label="Abmelden">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        </div>
      </aside>
    );
  }

  const textChannels = channels.filter((channel) => channel.type === 'text');
  const voiceChannels = channels.filter((channel) => channel.type === 'voice');

  return (
    <aside className="sidebar">
      <div className="sidebar-content">
        <div className="workspace-title">
          <div>
            <h2>{server?.name ?? workspace?.name ?? 'Pulse Chat'}</h2>
            <p>{workspace?.tagline ?? 'Lokale Räume für schnelle Teamarbeit.'}</p>
          </div>
          <button className="icon-button" aria-label="Kanal anlegen" onClick={onCreateChannel}>
            +
          </button>
        </div>

        <button className="action secondary" style={{ width: '100%', marginBottom: '12px' }} onClick={onCreateChannel}>
          Kanal in dieser Gruppe
        </button>

        <div className="section-label">Textkanäle</div>
        {textChannels.map((channel) => (
          <button
            key={channel.id}
            className={`channel-item ${channel.id === selectedChannelId ? 'active' : ''}`}
            onClick={() => onSelect(channel.id)}
          >
            <span className="name">
              <span>#{channel.name}</span>
            </span>
            <span className="channel-meta">Chat</span>
          </button>
        ))}

        <div className="section-label">Sprachkanäle</div>
        {voiceChannels.map((channel) => (
          <button
            key={channel.id}
            className={`channel-item ${channel.id === selectedChannelId ? 'active' : ''}`}
            onClick={() => onSelect(channel.id)}
          >
            <span className="name">
              <span>⌁ {channel.name}</span>
            </span>
            <span className="channel-meta">Voice</span>
          </button>
        ))}

        <div className="section-label">Aktivität</div>
        {activity.slice(0, 4).map((item) => (
          <div key={item.id} className="group-card" style={{ marginBottom: '10px' }}>
            <div className="tiny-pill">{item.type}</div>
            <h4 style={{ margin: '10px 0 6px', fontSize: '0.98rem' }}>{item.title}</h4>
            <p className="helper" style={{ margin: 0, lineHeight: 1.5 }}>{item.detail}</p>
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="user-profile-section">
          <div className="user-profile-avatar-wrapper">
            <div className="user-profile-avatar" style={{ background: 'var(--accent)' }}>
              {currentUser?.name ? currentUser.name.slice(0, 2).toUpperCase() : 'U'}
            </div>
            <span className={`presence ${currentUser?.status ?? 'online'}`} />
          </div>
          <div className="user-profile-info">
            <span className="user-profile-name">{currentUser?.name ?? 'Gast'}</span>
            <span className="user-profile-handle">{currentUser?.handle ?? '@guest'}</span>
          </div>
        </div>
        <button className="icon-button compact logout-btn" title="Abmelden" onClick={onLogout} aria-label="Abmelden">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
        </button>
      </div>
    </aside>
  );
}

export const ChannelSidebar = memo(ChannelSidebarComponent);
