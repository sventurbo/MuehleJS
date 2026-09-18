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
    - Anmeldeversuche werden pro Verbindung und pro Client-Adresse gezählt. `X-Forwarded-For` zählt nur hinter einem per `TRUST_PROXY` freigegebenen Reverse Proxy (siehe [Betrieb hinter einem Reverse Proxy](#4-betrieb-hinter-einem-reverse-proxy-optional)).
    - Gezählt wird dabei auf den Adressblock: IPv4 (auch als IPv4-mapped `::ffff:a.b.c.d`) auf die reine IPv4-Adresse, natives IPv6 auf sein `/64`-Präfix. Ein IPv6-Client verfügt üblicherweise über mindestens ein ganzes `/64` und könnte sonst pro Verbindung eine frische Adresse wählen, ohne je an sein Budget zu stoßen.
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
   - 181 automatisierte Tests mit **Jest** für Spiellogik, Regeln, Matchmaking, Socket-Integration, Sicherheit/DoS-Schutz, den Client-Regel-Abgleich, das responsive Mobile-Layout und die Brett-Animationen.

---

## 🚀 Schnellanleitung (Installation & Start)

Das Projekt läuft auf jedem Rechner (z. B. Ubuntu, Debian, macOS) mit einer installierten Node.js-Umgebung. Die Untergrenze ist das jeweils aktive Node.js-LTS – aktuell **Node.js >= 24** („Krypton", aktives LTS seit 28.10.2025).

Die Anforderung steht in `package.json` unter `engines` und wird über `.npmrc` (`engine-strict=true`) durchgesetzt: `npm install` bricht auf einer älteren Node-Version sofort mit einer klaren `EBADENGINE`-Meldung ab, statt später an unpassender Stelle zu scheitern. Wird eine neue Node.js-Version zum aktiven LTS (Node 26 am 28.10.2026), werden `engines`, dieser Abschnitt und die CI-Matrix in `.github/workflows/node.js.yml` gemeinsam angehoben.

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

Anmeldeversuche werden nicht nur pro Verbindung, sondern auch pro Client-Adresse begrenzt. Als Adresse gilt standardmäßig die, von der die Verbindung tatsächlich kommt. Den Header `X-Forwarded-For` ignoriert der Server, denn jeder Client kann ihn selbst setzen und sich so für jede Verbindung eine neue Adresse ausdenken.

Läuft der Server hinter einem Reverse Proxy (z. B. nginx, Caddy, Traefik), kommen dagegen alle Verbindungen vom Proxy, und alle Spieler teilen sich ein gemeinsames Budget. Für diesen Fall legt die Umgebungsvariable `TRUST_PROXY` fest, welchen Proxys der Server den Header glaubt:

| Wert | Bedeutung |
|---|---|
| nicht gesetzt, `false` oder `0` | Standard: `X-Forwarded-For` wird ignoriert. |
| Adressen oder Netze, kommagetrennt (z. B. `127.0.0.1` oder `10.0.0.0/8,fd00::/8`) | Nur Verbindungen von diesen Proxys dürfen die Client-Adresse nennen. Zusätzlich gibt es die Kurzformen `loopback`, `linklocal` und `uniquelocal`. |
| Anzahl `n` (z. B. `1`) | Die `n` Hops direkt vor dem Server gelten als Proxys, egal von welcher Adresse sie kommen. |

```bash
TRUST_PROXY=loopback npm start
```
*(Beispiel für einen nginx auf demselben Rechner.)*

Der Server liest die Kette in `X-Forwarded-For` von rechts nach links: Jeder Eintrag eines vertrauten Proxys wird übersprungen, der erste andere ist der Client. Bei `TRUST_PROXY=10.0.0.1`, einer Verbindung von `10.0.0.1` und `X-Forwarded-For: 198.51.100.1, 203.0.113.7` zählt also `203.0.113.7`; `198.51.100.1` hat der Client selbst mitgeschickt und wird verworfen. Kommt eine Verbindung nicht von einem vertrauten Proxy, bleibt der Header unbeachtet.

- `TRUST_PROXY=true` wird abgelehnt: Dann wäre jeder Hop vertrauenswürdig und es zählte der linke Eintrag, den der Client selbst schreibt. Auch ungültige Adressen brechen den Start mit einer Fehlermeldung ab.
- Der Proxy muss die Adresse, von der er angesprochen wird, an den Header anhängen oder ihn damit überschreiben (nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`).
- Mit einer Anzahl statt Adressen darf der Node-Port nicht direkt erreichbar sein, sonst umgeht ein Client den Proxy und füllt den Header selbst. Eine Adressliste ist in diesem Punkt robuster.

Die so ermittelte Adresse zählt anschließend nicht für sich allein, sondern für ihren Block: IPv4 und IPv4-mapped IPv6 (`::ffff:a.b.c.d`) werden auf die reine IPv4-Adresse abgebildet, natives IPv6 auf sein `/64`-Präfix (z. B. `2001:db8:1:2::/64`). Ein IPv6-Client verfügt in der Regel über mindestens ein ganzes `/64`; ohne diese Zusammenfassung stünden ihm pro Verbindung eine frische Adresse und damit beliebig viele Budgets zur Verfügung.

---

## 🧪 Tests ausführen

Das Projekt verfügt über eine umfassende Testsuite mit Jest:
```bash
npm test
```

Getestet werden (181 Tests in 8 Test-Dateien):
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
- Sicherheits- und DoS-Schutzmaßnahmen (Rate Limiting inkl. Adressblock-Budget und Proxy-Vertrauen, Eingabesäuberung).
- Responsives Mobile-Layout (Viewport-Meta, Touch-Zielgrößen, Safe-Area, Tab-Leiste, Hover-Gating).

### WCAG 2.1 AA Kontrastprüfung

Das Projekt enthält einen automatisierten Kontrast-Checker, der sicherstellt, dass alle Farbkombinationen die WCAG 2.1 AA Anforderungen erfüllen:
```bash
npm run contrast-check
```
Dieser prüft alle Farbpaare in den Dark- und Light-Themes des Stylesheets. Die
Tokens liest er aus `public/css/tokens.css` — über `scripts/css-bundle.js`, das
die `@import`-Kette auflöst, sodass der Checker das Stylesheet als Ganzes sieht.

---

## 🎨 CSS-Architektur

Das Stylesheet ist in neun Module aufgeteilt, die jeweils einen Abschnitt der
Oberfläche abdecken. `public/css/style.css` enthält keine eigenen Regeln mehr,
sondern ist das Manifest: es zieht die Module per `@import` in Kaskadenreihenfolge
herein. Die Seite bindet weiterhin nur dieses eine Stylesheet ein.

```
public/css/style.css   →   tokens · base · layout · controls · login
                           game · board · modals · responsive
```

Die Reihenfolge ist Teil des Vertrags: `tokens.css` steht zuerst, weil alle
anderen Module seine Custom Properties benutzen, `responsive.css` zuletzt, weil
seine Breakpoints die Module darüber überschreiben. Ein neues Modul gilt erst,
wenn es im Manifest steht — `tests/CssModules.test.js` prüft genau das, zusammen
mit der Regel, dass Custom Properties ausschließlich in `tokens.css` deklariert
werden.

Werkzeuge, die das Stylesheet als Ganzes lesen (der Kontrast-Checker und die
statischen CSS-Tests), gehen über `scripts/css-bundle.js`. Das Skript löst die
`@import`-Kette auf und gibt den zusammengesetzten Stylesheet-Text zurück:

```bash
node scripts/css-bundle.js   # gibt das aufgelöste Stylesheet auf stdout aus
```

---

## 📁 Projektstruktur

```
Web-Spiel/
├── package.json              # Projektkonfiguration, Abhängigkeiten & Scripts
├── server.js                 # Express HTTP-Server & Socket.io Event-Orchestrierung (IPv6 & IPv4)
├── Systemmodel.md            # Umfassendes Systemmodell (Architektur, Domänenmodell, State Machines)
├── scripts/
│   ├── contrast.js           # WCAG 2.1 Kontrastberechnung (relative Luminance, Kontrastverhältnis)
│   ├── contrast-check.js     # CLI-Skript zum Prüfen aller CSS-Farbpaare gegen WCAG 2.1 AA
│   └── css-bundle.js         # Löst die @import-Kette von style.css auf (für Checker & Tests)
├── lib/
│   ├── MuehleGame.js         # Autoritatives Spielregel- und Zustandsmodell (24 Punkte, Mühlen, Phasen)
│   ├── GameManager.js        # Matchmaking-Warteschlange & Verwaltung paralleler Spielräume
│   ├── clientAddress.js      # Client-Adresse & Budget-Schlüssel fürs Rate-Limiting (X-Forwarded-For nur von vertrauten Proxys, IPv6 pro /64)
│   └── RateLimiter.js        # In-Memory Sliding-Window Rate Limiter (DoS-Schutz)
├── public/
│   ├── index.html            # Single-Page-App (Login, Matchmaking, Spielbrett, Modals)
│   ├── css/                  # Modulares Stylesheet, per @import in Kaskadenreihenfolge gebündelt
│   │   ├── style.css         # Manifest: nur die @import-Liste, keine eigenen Regeln
│   │   ├── tokens.css        # Design-Tokens (:root) + Light-Theme-Override
│   │   ├── base.css          # Reset, Typografie, Touch-Handling, Scrollbars, Icons
│   │   ├── layout.css        # App-Shell: Header (Verbindungsstatus, Ton) & Screen-Switcher
│   │   ├── controls.css      # Buttons & Eingabefelder
│   │   ├── login.css         # Screen 1 & 2: Login/Lobby und Matchmaking-Warteschlange
│   │   ├── game.css          # Screen 3: HUD, Spielerkarten, Arena, Dock (Zugliste & Chat)
│   │   ├── board.css         # SVG-Brett (Gradienten, Marker, Stein-Animationen)
│   │   ├── modals.css        # Dialoge & Toasts
│   │   └── responsive.css    # Breakpoints, pointer/hover, prefers-reduced-motion
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
│   ├── Responsive.test.js    # Strukturtests für Smartphone-Layout, Touch-Ziele & iOS-Anpassungen
│   ├── BoardAnimation.test.js # Strukturtests für Stein-Animationen und Mühlen-Beam
│   └── CssModules.test.js    # Guards für das CSS-Manifest (Vollständigkeit, Kaskadenreihenfolge, Token-Zugriff des Kontrast-Checkers)
├── .gitignore                # Git-Ignore (node_modules, .DS_Store, coverage, .env)
├── .npmrc                    # engine-strict=true (erzwingt die Node-Version aus "engines")
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

