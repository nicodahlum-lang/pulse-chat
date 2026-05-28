import { memo } from 'react';
import type { ActivityItem, Channel, CurrentUser, Member, Server, VoiceRoom, Presence } from '../types';

interface Props {
  server: Server | null;
  members: Member[];
  activity: ActivityItem[];
  currentUser: CurrentUser | null;
  voiceRoom: VoiceRoom;
  currentChannel: Channel | null;
  onChangeStatus: (status: Presence, activity: string) => void;
}

function InspectorPanelComponent({ server, members, activity, currentUser, voiceRoom, currentChannel, onChangeStatus }: Props) {
  return (
    <aside className="inspector">
      <div className="preview-card">
        <div className="tiny-pill">Team</div>
        <h3 className="panel-title" style={{ marginTop: '10px' }}>{server?.name ?? 'Pulse Chat'}</h3>
        <p className="helper">{server?.description ?? 'Lokaler Gruppenchat für Text, Voice und schnelle Abstimmungen.'}</p>
      </div>

      <div className="section-label">Kanalstatus</div>
      <div className="stat-grid">
        <div className="stat-card">
          <small>Nachrichten</small>
          <strong>{currentChannel?.type === 'text' || currentChannel?.type === 'dm' ? activity.length + 4 : voiceRoom.participants.length}</strong>
        </div>
        <div className="stat-card">
          <small>Aktiv</small>
          <strong>{voiceRoom.participants.length}</strong>
        </div>
      </div>

      <div className="section-label">Mitglieder</div>
      <div className="stack">
        {members.map((member) => (
          <div key={member.id} className="member-row">
            <div>
              <strong>{member.name}</strong>
              <div className="role">{member.handle} · {member.role}</div>
              {member.activity && <div className="role" style={{ color: 'var(--accent-2)', marginTop: '2px', fontSize: '0.78rem' }}>💬 {member.activity}</div>}
            </div>
            <span className={`presence ${member.status}`} />
          </div>
        ))}
      </div>

      <div className="section-label">Eigener Status</div>
      <div className="preview-card" style={{ display: 'grid', gap: '10px' }}>
        <div>
          <strong>{currentUser?.name ?? 'Mara'}</strong>
          <p className="helper" style={{ margin: '4px 0 0' }}>{currentUser?.handle ?? '@mara'} · {currentUser?.role ?? 'Product'}</p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span className={`presence ${currentUser?.status ?? 'online'}`} style={{ width: '8px', height: '8px' }} />
          <select
            value={currentUser?.status ?? 'online'}
            onChange={(e) => onChangeStatus(e.target.value as Presence, currentUser?.activity ?? '')}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--line)',
              borderRadius: '8px',
              color: 'var(--text)',
              padding: '4px 8px',
              fontSize: '0.86rem',
              outline: 'none',
              cursor: 'pointer',
              flex: 1
            }}
          >
            <option value="online">Online</option>
            <option value="idle">Abwesend</option>
            <option value="dnd">DND (Nicht stören)</option>
            <option value="offline">Unsichtbar</option>
          </select>
        </div>

        <input
          type="text"
          value={currentUser?.activity ?? ''}
          onChange={(e) => onChangeStatus(currentUser?.status ?? 'online', e.target.value)}
          placeholder="Statusnachricht eingeben ..."
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--line)',
            borderRadius: '8px',
            color: 'var(--text)',
            padding: '6px 10px',
            fontSize: '0.82rem',
            outline: 'none',
            width: '100%'
          }}
        />
      </div>

      <div className="section-label">Aktivität</div>
      <div className="stack">
        {activity.slice(0, 3).map((item) => (
          <div key={item.id} className="group-card">
            <strong>{item.title}</strong>
            <p className="helper" style={{ margin: '6px 0 0' }}>{item.detail}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}

export const InspectorPanel = memo(InspectorPanelComponent);
