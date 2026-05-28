import { useMemo, useState } from 'react';
import type { Server } from '../types';

interface Props {
  currentServerId: string;
  servers: Server[];
  onClose: () => void;
  onSubmit: (input: { serverId: string; name: string; type: 'text' | 'voice'; topic: string }) => Promise<void>;
}

export function CreateChannelModal({ currentServerId, servers, onClose, onSubmit }: Props) {
  const serverIdId = 'create-channel-server';
  const typeId = 'create-channel-type';
  const nameId = 'create-channel-name';
  const topicId = 'create-channel-topic';
  const [serverId, setServerId] = useState(currentServerId || servers[0]?.id || '');
  const [name, setName] = useState('');
  const [type, setType] = useState<'text' | 'voice'>('text');
  const [topic, setTopic] = useState('');
  const [saving, setSaving] = useState(false);

  const serverName = useMemo(() => servers.find((server) => server.id === serverId)?.name ?? 'Gruppe', [servers, serverId]);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-title">Kanal anlegen</div>
        <p className="helper">Lege einen neuen Text- oder Voice-Raum in deiner ausgewählten Gruppe an.</p>

        <div className="modal-grid">
          <div className="field">
            <label htmlFor={serverIdId}>Gruppe</label>
            <select id={serverIdId} name="channel-server" value={serverId} onChange={(event) => setServerId(event.target.value)}>
              {servers.map((server) => (
                <option key={server.id} value={server.id}>{server.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={typeId}>Typ</label>
            <select id={typeId} name="channel-type" value={type} onChange={(event) => setType(event.target.value as 'text' | 'voice')}>
              <option value="text">Textkanal</option>
              <option value="voice">Voice-Raum</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor={nameId}>Name</label>
          <input id={nameId} name="channel-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={type === 'voice' ? 'War Room' : 'launch-talk'} />
        </div>

        <div className="field">
          <label htmlFor={topicId}>Topic</label>
          <textarea id={topicId} name="channel-topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder={`Worum geht es in ${serverName}?`} />
        </div>

        <div className="modal-actions">
          <button className="ghost action" onClick={onClose}>Abbrechen</button>
          <button
            className="action"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await onSubmit({ serverId, name, type, topic });
              setSaving(false);
              onClose();
            }}
          >
            {saving ? 'Speichert …' : 'Kanal erstellen'}
          </button>
        </div>
      </div>
    </div>
  );
}
