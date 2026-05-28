import { useState } from 'react';

interface Props {
  onClose: () => void;
  onSubmit: (input: { name: string; icon: string; accent: string; description: string }) => Promise<void>;
}

const swatches = ['#7c9cff', '#4dd6ff', '#45e19c', '#f7c76a', '#ff6e8f', '#aa7bff'];

export function CreateServerModal({ onClose, onSubmit }: Props) {
  const nameId = 'create-server-name';
  const iconId = 'create-server-icon';
  const descriptionId = 'create-server-description';
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('◌');
  const [accent, setAccent] = useState(swatches[0]);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-title">Neue Gruppe anlegen</div>
        <p className="helper">Erstelle einen frischen Space mit eigenem Look, Kanal-Set und Voice-Räumen.</p>

        <div className="modal-grid">
          <div className="field">
            <label htmlFor={nameId}>Name</label>
            <input id={nameId} name="server-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Team Orbit" />
          </div>
          <div className="field">
            <label htmlFor={iconId}>Icon</label>
            <input id={iconId} name="server-icon" value={icon} onChange={(event) => setIcon(event.target.value.slice(0, 4))} placeholder="✦" />
          </div>
        </div>

        <div className="field">
          <label htmlFor={descriptionId}>Beschreibung</label>
          <textarea id={descriptionId} name="server-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Worum dreht sich diese Gruppe?" />
        </div>

        <div className="field">
          <label>Akzentfarbe</label>
          <div className="toolbar">
            {swatches.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className="icon-button"
                onClick={() => setAccent(swatch)}
                style={{ background: swatch, color: '#04050a', borderColor: accent === swatch ? '#fff' : 'transparent' }}
                aria-label={`Farbe ${swatch}`}
              />
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button className="ghost action" onClick={onClose}>Abbrechen</button>
          <button
            className="action"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await onSubmit({ name, icon, accent, description });
              setSaving(false);
              onClose();
            }}
          >
            {saving ? 'Speichert …' : 'Gruppe erstellen'}
          </button>
        </div>
      </div>
    </div>
  );
}
