import { memo, type CSSProperties } from 'react';
import type { CurrentUser, Server } from '../types';

interface Props {
  servers: Server[];
  currentUser: CurrentUser | null;
  selectedServerId: string;
  socketState: 'offline' | 'connecting' | 'online';
  onSelect: (serverId: string) => void;
  onCreate: () => void;
}

function ServerRailComponent({ servers, currentUser, selectedServerId, socketState, onSelect, onCreate }: Props) {
  return (
    <aside className="rail">
      <div className="rail-inner">
        <button
          className={`server-item ${selectedServerId === 'dms' ? 'active' : ''}`}
          aria-label="Direktnachrichten"
          title="Direktnachrichten"
          onClick={() => onSelect('dms')}
          style={{ '--accent': '#8a7dff' } as CSSProperties}
        >
          ✉
        </button>
        <div className="divider" />
        {servers.map((server) => (
          <button
            key={server.id}
            className={`server-item ${server.id === selectedServerId ? 'active' : ''}`}
            aria-label={server.name}
            title={server.name}
            onClick={() => onSelect(server.id)}
            style={{ '--accent': server.accent } as CSSProperties}
          >
            {server.icon}
          </button>
        ))}
        <div className="divider" />
        <button className="icon-button" aria-label="Neue Gruppe erstellen" onClick={onCreate}>
          +
        </button>
        <div className="divider" />
        <button className="chip" aria-label="Verbindungsstatus">
          {socketState === 'online' ? 'Live' : socketState === 'connecting' ? '…' : 'Offline'}
        </button>
      </div>
    </aside>
  );
}

export const ServerRail = memo(ServerRailComponent);
