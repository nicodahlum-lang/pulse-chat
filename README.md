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

## Erweiterung

Gute Stellen für weitere Features:

- Reaktionen und Thread-Antworten in `backend/src/store.js`
- DMs und Freundesliste im Frontend unter `frontend/src/components/`
- Suchfunktion und Kanalfilter in `frontend/src/App.tsx`
- Persistente Präsenz / Typing-Indikatoren im Socket-Layer

## Verifikation

Siehe [VALIDATION.md](./VALIDATION.md) für die konkrete Prüfliste.
