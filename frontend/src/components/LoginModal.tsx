import { useState, type FormEvent } from 'react';

interface Props {
  workspaceName: string;
  onLogin: (input: { identifier: string; password: string }) => Promise<void>;
  onRegister: (input: { name: string; username: string; email: string; password: string; role: string }) => Promise<void>;
}

const DEMO_ACCOUNTS = [
  { label: 'Mara', identifier: 'mara', password: 'mara1234' },
  { label: 'Leo', identifier: 'leo', password: 'leo1234' },
];

export function LoginModal({ workspaceName, onLogin, onRegister }: Props) {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await onLogin({
        identifier: identifier.trim(),
        password,
      });
    } catch (err: any) {
      setError(err.message ?? 'Login fehlgeschlagen.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await onRegister({
        name: name.trim(),
        username: username.trim(),
        email: email.trim(),
        password: registerPassword,
        role: role.trim() || 'Mitglied',
      });
    } catch (err: any) {
      setError(err.message ?? 'Registrierung fehlgeschlagen.');
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
          <p className="helper">{workspaceName}</p>
        </div>

        <div className="login-tabs">
          <button
            className={`login-tab ${tab === 'login' ? 'active' : ''}`}
            onClick={() => {
              setTab('login');
              setError(null);
            }}
          >
            Anmelden
          </button>
          <button
            className={`login-tab ${tab === 'register' ? 'active' : ''}`}
            onClick={() => {
              setTab('register');
              setError(null);
            }}
          >
            Konto erstellen
          </button>
        </div>

        {error && <div className="login-error">{error}</div>}

        {tab === 'login' ? (
          <form onSubmit={handleLogin} className="login-form">
            <div className="field">
              <label htmlFor="login-identifier">E-Mail oder Benutzername</label>
              <input
                id="login-identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="z.B. mara oder mara@pulse.chat"
                required
                autoComplete="username"
              />
            </div>

            <div className="field">
              <label htmlFor="login-password">Passwort</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Dein Passwort"
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              className="action login-submit-btn"
              disabled={isSubmitting || !identifier.trim() || !password}
            >
              {isSubmitting ? 'Melde an ...' : 'Anmelden'}
            </button>

            <div className="login-demo-box">
              <strong>Demo-Zugänge</strong>
              <div className="login-demo-list">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.identifier}
                    type="button"
                    className="login-demo-chip"
                    onClick={() => {
                      setIdentifier(account.identifier);
                      setPassword(account.password);
                      setTab('login');
                    }}
                  >
                    <span>{account.label}</span>
                    <small>{account.identifier} / {account.password}</small>
                  </button>
                ))}
              </div>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="login-form">
            <div className="field">
              <label htmlFor="register-name">Name</label>
              <input
                id="register-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Alex"
                required
                autoComplete="name"
                maxLength={42}
              />
            </div>

            <div className="field">
              <label htmlFor="register-username">Benutzername</label>
              <input
                id="register-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="z.B. alex"
                required
                autoComplete="username"
                maxLength={32}
              />
            </div>

            <div className="field">
              <label htmlFor="register-email">E-Mail</label>
              <input
                id="register-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="z.B. alex@firma.de"
                required
                autoComplete="email"
                maxLength={120}
              />
            </div>

            <div className="field">
              <label htmlFor="register-role">Rolle</label>
              <input
                id="register-role"
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="z.B. Gast oder Teammitglied"
                autoComplete="organization-title"
                maxLength={32}
              />
            </div>

            <div className="field">
              <label htmlFor="register-password">Passwort</label>
              <input
                id="register-password"
                type="password"
                value={registerPassword}
                onChange={(e) => setRegisterPassword(e.target.value)}
                placeholder="Mindestens 6 Zeichen"
                required
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              className="action login-submit-btn"
              disabled={isSubmitting || !name.trim() || !username.trim() || !email.trim() || !registerPassword}
            >
              {isSubmitting ? 'Konto wird angelegt ...' : 'Konto erstellen'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
