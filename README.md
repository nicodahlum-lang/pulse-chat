# Pulse Chat

Pulse Chat ist eine lokale Discord-artige Chat-App mit:

- Gruppen/Servern
- Textkanälen
- Voice-Räumen mit Push-to-talk
- Live-Updates per Socket.IO
- lokaler Seed-Datenbank in JSON

Die App läuft komplett lokal. Es gibt keine Cloud-Abhängigkeit und keinen externen Login.

## Projektstruktur

- `backend/` - Express API, Socket.IO, JSON-Store, Seed-Daten
- `frontend/` - React + Vite UI
- `package.json` - Root-Skripte für Install, Dev, Build und Check

## Voraussetzungen

- Node.js 20+
- Mikrofonzugriff im Browser für Voice-Räume

## Starten

```bash
npm run bootstrap
npm run seed
npm run dev
```

Dann öffnen:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5001`

## Wichtige Skripte

- `npm run bootstrap` - installiert Backend- und Frontend-Abhängigkeiten
- `npm run dev` - startet beide Dev-Server parallel
- `npm run dev:backend` - nur Backend
- `npm run dev:frontend` - nur Frontend
- `npm run seed` - setzt den lokalen Seed-Workspace zurück
- `npm run check` - Backend-Tests, Frontend-Typecheck, Frontend-Build

## API / Echtzeit

Das Backend stellt bereit:

- `GET /api/bootstrap` - kompletter Workspace-Zustand
- `GET /api/state` - gleicher Zustand für Debugging
- `POST /api/servers` - neue Gruppe anlegen
- `POST /api/channels` - neuen Text- oder Voice-Kanal anlegen
- `POST /api/messages` - Textnachricht senden
- `POST /api/voice/join` - Voice-Raum betreten
- `POST /api/voice/leave` - Voice-Raum verlassen

Socket-Events:

- `message:new`
- `voice:state`
- `voice:chunk`
- `state:reset`

## Voice-Setup

Voice läuft als lokaler Push-to-talk-Stream:

- Browser fragt Mikrofonzugriff ab
- Audio wird in kleine Chunks zerlegt
- Chunks gehen über Socket.IO an andere offene Clients im gleichen Voice-Raum

Das ist bewusst lokal und einfach gehalten, damit die Funktion ohne separate Infrastruktur funktioniert.

## Fortgeschrittene Features (Neu)

Folgende Premium-Features wurden hinzugefügt:

- **Direktnachrichten (DMs)**: Private 1-on-1-Räume zwischen Mitgliedern.
- **Emoji-Reaktionen**: Emoji-Reaktionen unter Nachrichten in Echtzeit.
- **Thread-Antworten**: Nachrichten-Zitate und verschachtelte Antworten.
- **Markdown**: Formatiere Nachrichten mit `**fett**`, `*kursiv*` oder Code-Blöcken.
- **Präsenz-Status**: Wähle deinen Status (`online`, `idle`, `dnd`, `offline`) und setze individuelle Aktivitätsnachrichten.
- **Voice-Visualizer**: Die Sprech-Karten leuchten und pulsieren in Echtzeit basierend auf der Mikrofon-Lautstärke.
- **Profil-Auswahl & Erstellung**: Ein moderner Login-Screen ermöglicht es, als bestehendes Mitglied beizutreten oder direkt ein neues Profil mit Name, Rolle und Avatar-Farbe zu erstellen.

## Cloud-Deployment & Datenbank-Persistenz

Die App kann komplett kostenlos im Internet gehostet werden (z. B. auf **Render.com**), sodass du sie mit deinen Freunden teilen kannst. 

Da Server auf Render im Free-Plan temporären Speicher nutzen (Daten gehen bei Neustarts verloren), wurde eine **PostgreSQL-Datenbankintegration** hinzugefügt. Wenn die Umgebungsvariable `DATABASE_URL` gesetzt ist, speichert die App alle Chats und Mitglieder automatisch in einer Cloud-Datenbank.

### Setup-Anleitung (Render + Neon/Supabase)

1. **Kostenlose PostgreSQL-Datenbank erstellen**:
   - Erstelle eine kostenlose Datenbank bei [Neon.tech](https://neon.tech) oder [Supabase.com](https://supabase.com).
   - Kopiere den Verbindungs-String (`postgresql://...`).

2. **Web Service auf Render erstellen**:
   - Melde dich bei [Render.com](https://render.com) an.
   - Wähle **New +** > **Web Service**.
   - Verbinde das GitHub-Repository `pulse-chat`.
   - Konfiguriere folgende Felder:
     - **Build Command**: `npm run build`
     - **Start Command**: `npm start`
     - **Instance Type**: `Free`

3. **Umgebungsvariablen eintragen**:
   - Gehe im Render-Dashboard deines Services auf **Environment** und füge hinzu:
     - `NODE_ENV` = `production`
     - `DATABASE_URL` = *[Dein PostgreSQL-Verbindungs-String]*

4. **Deployen & Teilen**:
   - Nach erfolgreichem Build ist die App über die Render-URL (z. B. `https://dein-pulse-chat.onrender.com`) für dich und deine Freunde im Internet erreichbar! Beim ersten Laden kann jeder sein eigenes Profil erstellen und sofort loslegen.

## Verifikation

Siehe [VALIDATION.md](./VALIDATION.md) für die konkrete Prüfliste.

