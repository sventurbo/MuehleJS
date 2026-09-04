# Mühle (Nine Men's Morris) – Multiplayer Web-Spiel

Ein modernes, responsives Multiplayer-Webspiel für das traditionelle Strategiespiel **Mühle** (*Nine Men's Morris* / *Mill*), entwickelt im Rahmen der Vorlesung Web-Programmierung.

Das Projekt verzichtet im Frontend vollständig auf große Frameworks (reines **HTML5, CSS3 und Vanilla JavaScript**) und nutzt serverseitig **Node.js, Express** und **Socket.io** für die Echtzeit-Kommunikation.

---

## 🎯 Features & Highlights

- **Vollständige offizielle Mühle-Regeln**:
  - **Phase 1: Setzphase**: Abwechselndes Setzen der 9 Steine pro Spieler.
  - **Phase 2: Zugphase**: Ziehen entlang der markierten Verbindungslinien.
  - **Phase 3: Endphase (Springen)**: Sobald ein Spieler auf genau 3 Steine reduziert ist, darf er frei auf jedes offene Feld springen.
  - **Mühlenerkennung**: Automatische Erkennung geschlossener Mühlen (3 Steine in einer Reihe).
  - **Schlag-Regel mit Mühlenschutz**: Steine in geschlossenen gegnerischen Mühlen sind geschützt, *es sei denn*, der Gegner besitzt ausschließlich Steine in Mühlen.
  - **Sieg-/Verlustprüfung**: Sieg bei Reduktion des Gegners auf weniger als 3 Steine oder wenn der Gegner keinen legalen Zug mehr ausführen kann (eingesperrt).
- **Automatisches Matchmaking**:
  - Spieler melden sich über die Login-Seite an.
  - Sobald ein zweiter Spieler beitritt, werden beide sofort gepaart und das Spiel startet in einem isolierten Raum.
  - Beliebig viele parallele Partien gleichzeitig möglich.
- **Robustes Fehlermanagement**:
  - Bei Verbindungsabbruch eines Spielers wird die Partie sauber terminiert und der verbleibende Spieler benachrichtigt.
  - Der Server stürzt unter keinen Umständen ab (`try/catch`-Guards, globale Exception-Handler).
- **Dual-Stack Netzwerkunterstützung (IPv6 & IPv4)**:
  - Primär auf **IPv6** (`::`) gebunden – ideal für moderne Server- und Cloud-Umgebungen.
  - Unterstützt gleichzeitig **IPv4** (über IPv4-mapped Dual-Stack oder dedizierten sekundären Fallback-Listener auf `0.0.0.0`).
- **Modernes, responsives UI**:
  - Vektorbasiertes, gestochen scharfes **SVG-Spielfeld** mit dynamischen Animationen (drehende Auswahlringe, pulsierende Zielmarker, goldener Mühle-Strahl).
  - Optimiert für Desktop ab **1024 × 768 Pixeln** sowie skalierbar auf größere Bildschirme.
  - Cross-Browser-kompatibel (aktuelle Versionen von **Chrome, Firefox, Safari**).
  - Integrierte Web-Audio-Synthesizer-Soundeffekte (keine externen MP3-Dateien nötig, 100% offlinefähig).
  - Integrierter Live-Chat & detailliertes Zugprotokoll.
- **Automatisierte Testsuite**:
  - 28 automatisierte Tests mit **Jest** für Spiellogik, Regeln, Matchmaking und Socket-Integration.

---

## 🚀 Schnellanleitung (Installation & Start)

Das Projekt läuft auf jedem Rechner (z. B. Ubuntu, Debian, macOS) mit einer installierten Node.js-Umgebung (Version >= 18).

### 1. Abhängigkeiten installieren
```bash
npm install
```

### 2. Build ausführen
```bash
npm run build
```
*(Da reines Vanilla JavaScript im Frontend verwendet wird, ist kein komplexer Bundler nötig. Der Befehl schließt sofort erfolgreich ab).*

### 3. Server starten

Standardmäßig auf Port `3000`:
```bash
npm start
```

Mit einem benutzerdefinierten Port (z. B. Port `8080`):
```bash
npm start 8080
# oder
node server.js 8080
# oder
PORT=8080 npm start
```

Anschließend ist das Spiel erreichbar unter:
- **IPv6:** `http://[::1]:<port>` (bzw. über die öffentliche IPv6-Adresse des Servers)
- **IPv4:** `http://127.0.0.1:<port>` (bzw. über die IPv4-Adresse des Servers)

---

## 🧪 Tests ausführen

Das Projekt verfügt über eine umfassende Testsuite mit Jest:
```bash
npm test
```

Getestet werden:
- Vollständige Geometrie (24 Punkte, 32 Kanten, 16 Mühlen).
- Setzphase, Zugphase, Springphase (bei 3 Steinen).
- Mühlenerkennung und Schlag-Regeln (inkl. Mühlenschutz-Ausnahme).
- Sieg durch Steinedezimierung (< 3 Steine).
- Sieg durch Einsperren des Gegners (keine legalen Züge).
- Matchmaking-Warteschlange und Sitzungsisolation.
- Verbindungsabbruch und saubere Beendigung.
- Vollständiger Client-Server-Integrationsfluss über WebSockets.

---

## 📁 Projektstruktur

```
Web-Spiel/
├── package.json              # Projektkonfiguration, Abhängigkeiten & Scripts
├── server.js                 # Express HTTP-Server & Socket.io Event-Orchestrierung (IPv6 & IPv4)
├── lib/
│   ├── MuehleGame.js         # Autoritatives Spielregel- und Zustandsmodell (24 Punkte, Mühlen, Phasen)
│   └── GameManager.js        # Matchmaking-Warteschlange & Verwaltung paralleler Spielräume
├── public/
│   ├── index.html            # Single-Page-App (Login, Matchmaking, Spielbrett, Modals)
│   ├── css/
│   │   └── style.css         # Responsives Design (ab 1024x768), Vektor- und Partikelanimationen
│   └── js/
│       ├── audio.js          # Web Audio API Synthesizer (Setz-, Zug-, Schlag- & Fanfaren-Sounds)
│       ├── boardRenderer.js  # Dynamisches SVG-Spielfeld, Interaktionen & visuelle Hervorhebungen
│       └── app.js            # Client-Zustand, Socket.io-Client, HUD & Benutzeraktionen
├── tests/
│   ├── MuehleGame.test.js    # Unit-Tests für alle Spielregeln und Randfälle
│   ├── GameManager.test.js   # Unit-Tests für Matchmaking und Verbindungsabbruch
│   └── Integration.test.js   # End-to-End WebSocket-Integrationstests
└── README.md                 # Diese Dokumentation
```

---

## 📜 Offizielle Spielregeln im Überblick

1. **Ziel des Spiels**:
   Den Gegner auf 2 Steine zu reduzieren oder ihn so einzusperren, dass er keinen legalen Zug mehr machen kann.
2. **Phase 1: Setzphase**:
   Beide Spieler setzen abwechselnd je einen Stein auf einen freien Punkt (insgesamt je 9 Steine).
3. **Phase 2: Zugphase**:
   Sind alle 18 Steine gesetzt, zieht jeder Spieler abwechselnd einen eigenen Stein entlang einer Verbindungslinie auf ein freies Nachbarfeld.
4. **Phase 3: Springen (Endphase)**:
   Besitzt ein Spieler nur noch genau 3 Steine, darf er mit seinen Steinen auf jedes beliebige freie Feld springen.
5. **Mühle & Schlagen**:
   Entstehen drei Steine einer Farbe in einer horizontalen oder vertikalen geraden Reihe, ist eine **Mühle** geschlossen. Der Spieler darf sofort einen gegnerischen Stein schlagen. Steine in geschlossenen Mühlen sind geschützt, es sei denn, alle gegnerischen Steine stehen in Mühlen.

---

## 🌐 IPv6 & IPv4 Protokoll-Architektur

Der Server bindet primär an `::` (IPv6 Unspecified). In modernen Betriebssystemen (Linux Kernel / macOS) werden darüber im Dual-Stack-Modus sowohl native IPv6-Anfragen als auch IPv4-Anfragen (via IPv4-mapped IPv6) verarbeitet.

Zusätzlich prüft `server.js` beim Start, ob das Host-Betriebssystem `net.ipv6.bindv6only = 1` erzwingt:
In diesem Fall startet automatisch ein paralleler sekundärer IPv4-Listener auf `0.0.0.0`, an den Socket.io ebenfalls angebunden wird. Dadurch ist die Erreichbarkeit über **beide Protokolle (IPv6 und IPv4)** unter allen Netzwerkbedingungen garantiert.

---

## 📄 Lizenz
MIT License.

