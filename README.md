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
- **Robustes Fehlermanagement & Sicherheit**:
  - Bei Verbindungsabbruch eines Spielers wird die Partie sauber terminiert und der verbleibende Spieler benachrichtigt.
  - Der Server stürzt unter keinen Umständen ab (`try/catch`-Guards, globale Exception-Handler).
  - **DoS-Schutz**: In-Memory Sliding-Window Rate Limiter schützt Socket.io- und HTTP-Events vor Spam und Flooding.
    Das Login-Kontingent pro Adresse zählt dabei auf den Adressblock statt auf die einzelne Adresse: IPv4 (auch in der
    IPv4-mapped Form `::ffff:a.b.c.d`) auf die reine IPv4-Adresse, natives IPv6 auf sein `/64`-Präfix. Ein IPv6-Client
    verfügt üblicherweise über mindestens ein ganzes `/64` und könnte sonst pro Verbindung eine frische Absenderadresse
    wählen, ohne je an sein Kontingent zu stoßen.
  - **Eingabesäuberung**: Alle Client-Inputs werden serverseitig bereinigt (HTML-Sanitization).
- **Dual-Stack Netzwerkunterstützung (IPv6 & IPv4)**:
  - Primär auf **IPv6** (`::`) gebunden – ideal für moderne Server- und Cloud-Umgebungen.
  - Unterstützt gleichzeitig **IPv4** (über IPv4-mapped Dual-Stack oder dedizierten sekundären Fallback-Listener auf `0.0.0.0`).
- **Minimalistisches, responsives UI**:
  - Durchgängiges Design-System: neutrale Flächen, ein einziger Akzentfarbton (Blau), Haarlinien-Ränder, 4pt-Abstandsraster und translucent Materials (`backdrop-filter`) statt farbiger Glow-Effekte.
  - Vektorbasiertes, gestochen scharfes **SVG-Spielfeld**; Auswahlring, Zielmarker und Mühle-Strahl sind ruhige, statische bzw. einmalig eingeblendete Marker.
  - **Animierte Steine**: ein gesetzter Stein springt kurz auf, ein gezogener gleitet leicht angehoben vom Start- zum Zielfeld (auch beim Springen), ein geschlagener blendet aus. Der Renderer patcht das Brett, statt es neu aufzubauen – Steine, die liegen bleiben, behalten ihren SVG-Knoten.
  - Vollständiges **Light- und Dark-Theme** über `prefers-color-scheme`; das Spielbrett folgt dem Theme (helles Brett im Light-Mode, dunkles im Dark-Mode).
  - Alle Icons sind **Inline-SVG** in `currentColor` – keine Emoji, keine Icon-Fonts, keine externen Assets.
  - Optimiert für Desktop ab **1024 × 768 Pixeln**: die komplette Spielfläche passt ohne Scrollen ins Fenster und skaliert auf größere Bildschirme.
  - **Vollwertige Smartphone-Unterstützung** (getestet bis hinunter zu 320 px Breite, Referenzgerät iPhone):
    - Eigene Touch-Layouts ab 700 px Breite: Spielername und „Spieler suchen" stehen in eigenen Zeilen, beide Spielerkarten teilen sich eine kompakte Zeile über dem Brett, das Brett nutzt die volle Breite.
    - Zugprotokoll und Chat teilen sich auf dem Handy eine Tab-Leiste (inkl. Ungelesen-Markierung), statt die Seite endlos zu verlängern.
    - Querformat: Spielerkarten flankieren das Brett, dessen Größe sich an der kurzen Bildschirmkante orientiert.
    - iOS-Feinheiten: `viewport-fit=cover` + `env(safe-area-inset-*)` für Notch und Home-Indicator, `100dvh` gegen die einklappende Safari-Leiste, 16 px Eingabefelder (kein Auto-Zoom), entsperrter Web-Audio-Kontext beim ersten Tap.
    - Touch-Bedienung: Tippziele ab 44 px, vergrößerte Trefferflächen auf dem Spielbrett, Druck- statt Hover-Feedback (Hover-Stile gelten nur für echte Zeigegeräte).
  - Respektiert `prefers-reduced-motion` (gilt auch für die Stein-Animationen).
  - Cross-Browser-kompatibel (aktuelle Versionen von **Chrome, Firefox, Safari** – Desktop wie auch **iOS Safari** und **Chrome für Android**).
  - Integrierte Web-Audio-Synthesizer-Soundeffekte (keine externen MP3-Dateien nötig, 100% offlinefähig).
  - Integrierter Live-Chat & detailliertes Zugprotokoll.
- **Automatisierte Testsuite**:
   - 174 automatisierte Tests mit **Jest** für Spiellogik, Regeln, Matchmaking, Socket-Integration, Sicherheit/DoS-Schutz, den Client-Regel-Abgleich, das responsive Mobile-Layout und die Brett-Animationen.

---

## 🚀 Schnellanleitung (Installation & Start)

Das Projekt läuft auf jedem Rechner (z. B. Ubuntu, Debian, macOS) mit einer installierten Node.js-Umgebung (Version >= 24).

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

### 4. Betrieb hinter einem Reverse Proxy (optional)

Steht der Server hinter einem Reverse Proxy (nginx, Caddy, Traefik …), ist die Peer-Adresse jeder Verbindung die des Proxys – ohne weitere Konfiguration teilen sich also alle Spieler ein einziges Rate-Limit-Kontingent. Die echte Client-Adresse steht in diesem Fall im Header `X-Forwarded-For`.

Diesen Header kann jeder Client aber auch selbst setzen. Er wird deshalb **nur** ausgewertet, wenn die Gegenstelle als vertrauenswürdiger Proxy konfiguriert ist; ohne Konfiguration zählt ausschließlich die nicht fälschbare Peer-Adresse:

```bash
# Nur der lokale Reverse Proxy darf X-Forwarded-For setzen
TRUST_PROXY=loopback npm start

# Mehrere Einträge: einzelne Adressen, CIDR-Bereiche und die Kurznamen
# loopback, linklocal und uniquelocal sind erlaubt
TRUST_PROXY="loopback, 10.0.0.0/8, 2001:db8::/32" npm start
```

Die `X-Forwarded-For`-Kette wird dabei von rechts nach links gelesen und beim ersten Eintrag beendet, der kein vertrauenswürdiger Proxy ist – das ist der Client. `TRUST_PROXY=true` vertraut jedem Hop und ist nur sinnvoll, wenn der Port ausschließlich vom Proxy erreichbar ist.

Für das Rate Limiting zählt anschließend nicht die einzelne Adresse, sondern ihr Block: IPv4 und IPv4-mapped IPv6 (`::ffff:a.b.c.d`) werden auf die reine IPv4-Adresse abgebildet, natives IPv6 auf sein `/64`-Präfix (z. B. `2001:db8:1:2::/64`). Ein Client, dem ohnehin ein ganzes Präfix gehört, kann sein Kontingent so nicht durch eine neue Adresse pro Verbindung umgehen.

---

## 🧪 Tests ausführen

Das Projekt verfügt über eine umfassende Testsuite mit Jest:
```bash
npm test
```

Getestet werden (174 Tests in 8 Test-Dateien):
- Vollständige Geometrie (24 Punkte, 32 Kanten, 16 Mühlen).
- Setzphase, Zugphase, Springphase (bei 3 Steinen).
- Mühlenerkennung und Schlag-Regeln (inkl. Mühlenschutz-Ausnahme).
- Übereinstimmung der Client-Regeln (`public/js/gameRules.js`) mit der Server-Engine.
- Brett-Diff für die Stein-Animationen: jede Aktion zufällig gespielter Partien wird als genau das Setzen, Ziehen oder Schlagen erkannt.
- Sieg durch Steinedezimierung (< 3 Steine).
- Sieg durch Einsperren des Gegners (keine legalen Züge).
- Matchmaking-Warteschlange und Sitzungsisolation.
- Verbindungsabbruch und saubere Beendigung.
- Vollständiger Client-Server-Integrationsfluss über WebSockets.
- Sicherheits- und DoS-Schutzmaßnahmen (Rate Limiting inkl. Adressblock-Schlüssel und Proxy-Vertrauen, Eingabesäuberung).
- Responsives Mobile-Layout (Viewport-Meta, Touch-Zielgrößen, Safe-Area, Tab-Leiste, Hover-Gating).

### WCAG 2.1 AA Kontrastprüfung

Das Projekt enthält einen automatisierten Kontrast-Checker, der sicherstellt, dass alle Farbkombinationen die WCAG 2.1 AA Anforderungen erfüllen:
```bash
npm run contrast-check
```
Dieser prüft alle Farbpaare in den Dark- und Light-Themes des Stylesheets.

---

## 📁 Projektstruktur

```
Web-Spiel/
├── package.json              # Projektkonfiguration, Abhängigkeiten & Scripts
├── server.js                 # Express HTTP-Server & Socket.io Event-Orchestrierung (IPv6 & IPv4)
├── Systemmodel.md            # Umfassendes Systemmodell (Architektur, Domänenmodell, State Machines)
├── scripts/
│   ├── contrast.js           # WCAG 2.1 Kontrastberechnung (relative Luminance, Kontrastverhältnis)
│   └── contrast-check.js     # CLI-Skript zum Prüfen aller CSS-Farbpaare gegen WCAG 2.1 AA
├── lib/
│   ├── MuehleGame.js         # Autoritatives Spielregel- und Zustandsmodell (24 Punkte, Mühlen, Phasen)
│   ├── GameManager.js        # Matchmaking-Warteschlange & Verwaltung paralleler Spielräume
│   ├── RateLimiter.js        # In-Memory Sliding-Window Rate Limiter (DoS-Schutz)
│   └── clientAddress.js      # Client-Adresse (X-Forwarded-For nur von vertrauten Proxys) & Rate-Limit-Schlüssel (/64)
├── public/
│   ├── index.html            # Single-Page-App (Login, Matchmaking, Spielbrett, Modals)
│   ├── css/
│   │   └── style.css         # Design-System (Tokens, Light/Dark-Theme), Layout & Animationen
│   └── js/
│       ├── audio.js          # Web Audio API Synthesizer (Setz-, Zug-, Schlag- & Fanfaren-Sounds)
│       ├── gameRules.js      # Geteilte Brettgeometrie, Schlag-Regeln & Brett-Diff (einzige Quelle für Schlag-Markierungen)
│       ├── boardRenderer.js  # Dynamisches SVG-Spielfeld (Farben via CSS-Tokens), Interaktionen, Hervorhebungen & Stein-Animationen
│       └── app.js            # Client-Zustand, Socket.io-Client, HUD & Benutzeraktionen
├── docs/
│   └── contrast-check.md     # Detaillierte Dokumentation der WCAG 2.1 AA Kontrastverifikation
├── .github/
│   └── workflows/
│       └── node.js.yml       # CI-Pipeline (Node.js 24.x, npm ci && npm test && npm run contrast-check)
├── tests/
│   ├── ContrastCheck.test.js # Unit-Tests für die WCAG 2.1 Kontrastberechnung (40 Tests)
│   ├── MuehleGame.test.js    # Unit-Tests für alle Spielregeln und Randfälle (389 Tests)
│   ├── GameRules.test.js     # Abgleich der Client-Regeln mit der Server-Engine (18 Tests)
│   ├── GameManager.test.js   # Unit-Tests für Matchmaking und Verbindungsabbruch (108 Tests)
│   ├── Integration.test.js   # End-to-End WebSocket-Integrationstests (127 Tests)
│   ├── Security.test.js      # Sicherheits- und DoS-Schutztests (Rate Limiting, Eingabesäuberung)
│   └── Responsive.test.js    # Strukturtests für Smartphone-Layout, Touch-Ziele & iOS-Anpassungen
├── .gitignore                # Git-Ignore (node_modules, .DS_Store, coverage, .env)
├── package-lock.json         # Abhängigkeits-Lockfile
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

