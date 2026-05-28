import { useState, useMemo } from 'react';
import type { Member } from '../types';

interface Props {
  members: Member[];
  onLogin: (userId: string) => void;
  onRegister: (input: { name: string; role: string; avatarFrom?: string; avatarTo?: string }) => Promise<string>;
}

const PRESET_GRADIENTS = [
  { from: '#9b8cff', to: '#4dd6ff' },
  { from: '#34d399', to: '#3b82f6' },
  { from: '#f59e0b', to: '#e11d48' },
  { from: '#ec4899', to: '#8b5cf6' },
  { from: '#10b981', to: '#059669' },
];

export function LoginModal({ members, onLogin, onRegister }: Props) {
  const [tab, setTab] = useState<'select' | 'create'>('select');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [gradientIdx, setGradientIdx] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeGradient = PRESET_GRADIENTS[gradientIdx];

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const newUserId = await onRegister({
        name: name.trim(),
        role: role.trim() || 'Gast',
        avatarFrom: activeGradient.from,
        avatarTo: activeGradient.to,
      });
      onLogin(newUserId);
    } catch (err: any) {
      setError(err.message ?? 'Fehler beim Erstellen des Profils.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-overlay">
      <div className="login-card">
        <div className="login-header">
          <div className="brand-mark">P</div>
          <h2>Pulse Chat</h2>
          <p className="helper">Gruppen, Kanäle und Voice-Räume für dein Team.</p>
        </div>

        <div className="login-tabs">
          <button
            className={`login-tab ${tab === 'select' ? 'active' : ''}`}
            onClick={() => { setTab('select'); setError(null); }}
          >
            Profil wählen
          </button>
          <button
            className={`login-tab ${tab === 'create' ? 'active' : ''}`}
            onClick={() => { setTab('create'); setError(null); }}
          >
            Neu registrieren
          </button>
        </div>

        {error && <div className="login-error">{error}</div>}

        {tab === 'select' ? (
          <div className="login-select-section">
            <p className="helper" style={{ marginBottom: '16px' }}>
              Wähle ein bestehendes Teammitglied aus, um als diese Person beizutreten:
            </p>
            <div className="login-members-grid">
              {members.map((member) => {
                const label = member.name.charAt(0).toUpperCase();
                // Preset matching color to make it look premium
                const fromColor = member.id === 'mara' ? '#9b8cff' : member.id === 'leo' ? '#3b82f6' : member.id === 'nina' ? '#ec4899' : member.id === 'tom' ? '#f59e0b' : '#10b981';
                const toColor = member.id === 'mara' ? '#4dd6ff' : member.id === 'leo' ? '#45e19c' : member.id === 'nina' ? '#8b5cf6' : member.id === 'tom' ? '#ff6e8f' : '#059669';

                return (
                  <button
                    key={member.id}
                    className="login-member-btn"
                    onClick={() => onLogin(member.id)}
                  >
                    <div
                      className="login-avatar"
                      style={{
                        background: `linear-gradient(135deg, ${fromColor}, ${toColor})`,
                      }}
                    >
                      {label}
                    </div>
                    <div className="login-member-info">
                      <strong>{member.name}</strong>
                      <span>{member.handle}</span>
                      <small>{member.role}</small>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateProfile} className="login-form">
            <div className="field">
              <label htmlFor="login-name">Dein Name</label>
              <input
                id="login-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Alex"
                required
                maxLength={42}
              />
            </div>

            <div className="field">
              <label htmlFor="login-role">Deine Rolle / Tätigkeit</label>
              <input
                id="login-role"
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="z.B. Gast oder Entwickler"
                maxLength={32}
              />
            </div>

            <div className="field">
              <label>Avatar-Farbe</label>
              <div className="avatar-preset-row">
                {PRESET_GRADIENTS.map((gradient, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`avatar-preset-btn ${gradientIdx === idx ? 'active' : ''}`}
                    style={{
                      background: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})`,
                    }}
                    onClick={() => setGradientIdx(idx)}
                    aria-label={`Farbe ${idx + 1}`}
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="action login-submit-btn"
              disabled={isSubmitting || !name.trim()}
            >
              {isSubmitting ? 'Verbindet ...' : 'Pulse Chat beitreten'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
