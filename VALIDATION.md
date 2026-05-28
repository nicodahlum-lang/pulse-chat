# Validation Checklist

## Backend

- [ ] `npm run seed` erstellt einen frischen Seed-Workspace
- [ ] `GET /api/bootstrap` liefert Server, Kanäle, Mitglieder, Nachrichten und Voice-Räume
- [ ] `POST /api/messages` speichert eine Textnachricht
- [ ] `POST /api/servers` legt eine neue Gruppe an
- [ ] `POST /api/channels` legt Text- und Voice-Kanäle an
- [ ] `npm test` im Backend läuft grün

## Frontend

- [ ] App lädt die Seed-Daten beim Start
- [ ] Server-Wechsel funktioniert
- [ ] Kanal-Wechsel funktioniert
- [ ] Neue Gruppe kann im Modal erstellt werden
- [ ] Neuer Kanal kann im Modal erstellt werden
- [ ] Textnachrichten erscheinen sofort in der Timeline
- [ ] Voice-Raum zeigt Teilnehmer und aktiven Sprecher
- [ ] Push-to-talk fragt Mikrofonzugriff an und sendet Audio-Chunks

## End-to-End

- [ ] Backend und Frontend laufen parallel auf `5001` und `5173`
- [ ] Socket.IO verbindet sich sauber
- [ ] Eine Textnachricht wird live im UI sichtbar
- [ ] Ein Voice-Raum kann betreten und verlassen werden
- [ ] Die mobile Ansicht bleibt ohne horizontales Überlaufen nutzbar

## Qualität

- [ ] Kein Browser-Default-Look bei Buttons und Inputs
- [ ] Dunkles, konsistentes Design
- [ ] Klare Abgrenzung von Gruppen, Kanälen, Chat und Inspector
- [ ] Die Dokumentation erklärt Start, Struktur und Erweiterung
