# Systemmodell: Mühle (Nine Men's Morris) Multiplayer-Webanwendung

Dieses Dokument beschreibt die ganzheitliche Systemarchitektur, das Domänenmodell, die Zustandsautomaten, die Interaktionssequenzen sowie das Sicherheits- und Schnittstellendesign der Webanwendung **Mühle**.

---

## Inhaltsverzeichnis
1. [Systemkontext & Architekturübersicht](#1-systemkontext--architekturübersicht)
2. [Komponentenarchitektur](#2-komponentenarchitektur)
3. [Domänen- & Datenmodell](#3-domänen--datenmodell)
4. [Zustandsmodelle (State Machines)](#4-zustandsmodelle-state-machines)
   - 4.1 [Spiellogik-Zustandsautomat](#41-spiellogik-zustandsautomat)
   - 4.2 [Client-Lifecycle-Zustandsautomat](#42-client-lifecycle-zustandsautomat)
5. [Sequenzdiagramme & Interaktionsabläufe](#5-sequenzdiagramme--interaktionsabläufe)
   - 5.1 [Matchmaking & Verbindungsaufbau](#51-matchmaking--verbindungsaufbau)
   - 5.2 [Spielzug, Mühlenschluss & Schlagen](#52-spielzug-mühlenschluss--schlagen)
   - 5.3 [Verbindungsabbruch & Fehlertoleranz](#53-verbindungsabbruch--fehlertoleranz)
   - 5.4 [Zug-Timer & automatischer Zug](#54-zug-timer--automatischer-zug)
6. [Schnittstellenspezifikation (Socket.io-Protokoll)](#6-schnittstellenspezifikation-socketio-protokoll)
7. [Sicherheits- & Resilienzmodell](#7-sicherheits--resilienzmodell)

---

## 1. Systemkontext & Architekturübersicht

Das System ist als **Client-Server-Architektur** konzipiert. Der Server agiert als **autoritative Instanz** (Authoritative Server Model) für alle Spielregeln und die Matchmaking-Verwaltung. Der Client übernimmt die Benutzeroberfläche, Rendering, akustisches Feedback und Benutzerinteraktionen.

```mermaid
graph TB
    subgraph Clients["Clients (Browser: Chrome, Firefox, Safari)"]
        C1["Client 1 (Spieler Weiß)"]
        C2["Client 2 (Spieler Schwarz)"]
        CN["Client N (Warteschlange)"]
    end

    subgraph Network["Netzwerk- & Transportebene"]
        IPv6["IPv6 (Primär: [::]:PORT)"]
        IPv4["IPv4 (Dual-Stack / Fallback: 0.0.0.0:PORT)"]
    end

    subgraph Backend["Node.js Application Server"]
        HTTP["Express HTTP Server (Statische Assets & API)"]
        WS["Socket.io WebSocket Server (Echtzeit-Events)"]
        GM["GameManager (Matchmaking & Sessionverwaltung)"]
        RL["RateLimiter (Anti-DoS & Anti-Spam)"]
        GE["MuehleGame Instances (Isolierte Spielregeln)"]
    end

    C1 <-->|HTTP / WSS| IPv6
    C2 <-->|HTTP / WSS| IPv6
    CN <-->|HTTP / WSS| IPv4

    IPv6 <--> HTTP
    IPv6 <--> WS
    IPv4 <--> HTTP
    IPv4 <--> WS

    HTTP --- WS
    WS <--> GM
    GM <--> RL
    GM -->|Verwaltet| GE
```

---

## 2. Komponentenarchitektur

Das Gesamtsystem gliedert sich in modulare, voneinander entkoppelte Subsysteme auf Client- und Serverseite:

```mermaid
graph LR
    subgraph Shared["Geteilt (eine Datei, beide Seiten)"]
        RULES["muehleRules.js (Brettgeometrie, Mühlen- & Schlag-Regeln, Brett-Diff)"]
    end

    subgraph Frontend["Frontend (Vanilla Web Stack)"]
        HTML["index.html (SPA Screens & Skript-Manifest)"]
        CSS["css/ (11 Module via @import: Tokens, Layout 320px - Desktop, SVG-Styles)"]
        APP["app.js (Controller: Socket, Screens, Brett-Interaktion)"]
        HUD["hudView.js (Phase, Zug-Badge, Spielerkarten, Countdown)"]
        DOCK["dockView.js (Zugprotokoll & Chat)"]
        OVL["overlays.js (Dialoge, Toasts, Verbindungsanzeige)"]
        BR["boardRenderer.js (SVG Renderer & Hitboxen)"]
        AU["audio.js (Web Audio API Synthesizer)"]
    end

    subgraph Backend["Backend (Node.js & Express)"]
        SRV["server.js (Dual-Stack Bootstrap & Socket Events)"]
        MGR["GameManager.js (Rooms, Queues, Lifecycle)"]
        RTL["RateLimiter.js (Sliding-Window Limiter)"]
        MHL["MuehleGame.js (Zustandsmaschine: Phasen, legale Züge, Sieg)"]
    end

    HTML --> APP
    CSS --> HTML
    APP --> HUD
    APP --> DOCK
    APP --> OVL
    APP --> BR
    APP --> AU
    APP <-->|WebSocket Events| SRV
    SRV --> MGR
    MGR --> RTL
    MGR --> MHL
    RULES --> BR
    RULES --> APP
    RULES --> MHL
```

Die Views (`hudView`, `dockView`, `overlays`, `boardRenderer`) besitzen bewusst
keinen Socket: sie bekommen fertige Daten und zeichnen. Nur `app.js` sendet
Aktionen an den Server. `tests/ClientModules.test.js` prüft genau das.

### Komponentenbeschreibung

#### Serverseitige Module
- **`server.js`**: Initialisiert Express, serviert statische Dateien (`/public`), konfiguriert Socket.io mit Payload-Grenzen (`maxHttpBufferSize: 10KB`), bindet das Dual-Stack IPv6/IPv4-Netzwerk und fängt Ausnahmen global ab.
- **`lib/GameManager.js`**: Verwaltet die Matchmaking-Warteschlange, Socket-zu-Spieler-Mappings (`socketMap`), Räume (`games`) und koordiniert Event-Aufrufe. Hier liegt auch der **Zug-Timer**: pro Partie eine eigene Uhr (Standard 25 s), die bei jeder angenommenen Aktion neu startet und bei Ablauf einen automatischen legalen Zug auslöst.
- **`shared/muehleRules.js`**: Das geteilte Regelmodul — Brettgeometrie (24 Punkte, 32 Adjazenzkanten, 16 Mühlenlinien), Mühlen- und Schlag-Regeln sowie der Brett-Diff, alles zustandsfrei. Server-Engine und Browser laden **dieselbe Datei** (der Server per `require`, die Seite über den Mount `/shared`), weshalb es keine zweite Brett-Definition gibt, die auseinanderlaufen könnte.
- **`lib/MuehleGame.js`**: Rein deterministische, autoritative Mühle-Zustandsmaschine auf Basis des geteilten Regelmoduls. Verwaltet Brett, Phase, Zugrecht und Historie und validiert Setzen, Ziehen, Springen sowie Sieg-/Verlustbedingungen. Über `getLegalActions()` / `makeRandomLegalMove()` liefert sie außerdem die vollständige Zugmenge des Spielers am Zug — die Grundlage des automatischen Zugs bei Zeitablauf.
- **`lib/RateLimiter.js`**: In-Memory Sliding-Window Token-Bucket-Filter zum Schutz vor Chat-Floods (CH-05), Queue-Flooding (DOS-01) und Aktions-Spam.
- **`lib/clientAddress.js`**: Ermittelt die Adresse, unter der ein Client limitiert wird. `X-Forwarded-For` wird nur ausgewertet, wenn die Gegenstelle als vertrauenswürdiger Proxy konfiguriert ist (`TRUST_PROXY`); anschließend wird die Adresse auf ihren Block reduziert (IPv4 und IPv4-mapped IPv6 auf die reine IPv4-Adresse, natives IPv6 auf sein `/64`-Präfix), damit ein Client mit eigenem Präfix sein Kontingent nicht durch Adresswechsel umgehen kann.

#### Clientseitige Module
- **`public/js/app.js`**: Controller für Socket.io-Client, Screen-Wechsel (Login, Queue, Game, Game Over) und Brett-Interaktion. Übersetzt Klicks in Server-Anfragen und Server-Events in Aufrufe der Views — er zeichnet selbst nichts.
- **`public/js/hudView.js`**: Phasenanzeige, Zug-Badge, Hinweisbanner, beide Spielerkarten und der Zug-Countdown aus den Server-Events `turnTimer` / `turnTimeout` — reine Anzeige ohne eigene Zeitlogik und ohne Socket.
- **`public/js/dockView.js`**: Zugprotokoll und Chat samt Tab-Leiste und Ungelesen-Markierung auf kleinen Bildschirmen. Hier liegt die Escaping-Grenze: Name und Text einer Nachricht gehen durch `escapeHtml()`, bevor Markup entsteht.
- **`public/js/overlays.js`**: Regel- und Spielende-Dialog, Toasts, Verbindungsanzeige und die Scroll-Sperre hinter einem offenen Dialog.
- **`public/js/boardRenderer.js`**: Dynamischer SVG-Renderer. Verankert jeden Knotenpunkt per `transform="translate(x, y)"` und legt Ziel-, Auswahl- und Schlagmarker einmalig an; ein Zustandswechsel schaltet nur noch deren `is-*`-Klasse um. Das Brett wird einmal aufgebaut und danach nur gepatcht: `MuehleRules.diffBoards()` bestimmt, welche Steine gesetzt, gezogen oder geschlagen wurden; nur diese werden per CSS-Animation eingeblendet, verschoben bzw. ausgeblendet, alle übrigen behalten ihren SVG-Knoten.
- **`public/js/audio.js`**: Reiner Web-Audio-API Synthesizer für Soundeffekte (Klicks, Züge, Mühlenklang, Schlag-Impact, Fanfaren). Jeder Effekt ist als Notenliste beschrieben; ein einziger Scheduler spielt sie.
- **`public/css/`**: Modulares Stylesheet. `style.css` ist reines Manifest und zieht die elf Module per `@import` in Kaskadenreihenfolge herein — `tokens.css` zuerst (Design-Tokens für beide Themes), `responsive.css` zuletzt (Breakpoints, Pointer-Typ, `prefers-reduced-motion`), dazwischen die Module je Screen bzw. Komponente. Werkzeuge, die das Stylesheet als Ganzes lesen (`scripts/contrast-check.js`, die statischen CSS-Tests), gehen über `scripts/css-bundle.js`, das die `@import`-Kette auflöst.

---

## 3. Domänen- & Datenmodell

```mermaid
classDiagram
    class GameManager {
        +Array waitingQueue
        +Map socketMap
        +Map games
        +number maxQueueSize
        +number maxActiveGames
        +number turnTimeoutMs
        +RateLimiter chatLimiter
        +RateLimiter queueLimiter
        +RateLimiter queueIpLimiter
        +RateLimiter actionLimiter
        +enqueuePlayer(socket, username)
        +dequeuePlayer(socketId)
        +handlePlacePiece(socket, point)
        +handleMovePiece(socket, from, to)
        +handleRemovePiece(socket, point)
        +handleChatMessage(socket, text)
        +handleTurnTimeout(gameId)
        +handlePlayerDisconnect(socketId)
        +getStats()
    }

    class MuehleGame {
        +string gameId
        +Object board
        +string turn
        +string phase
        +Object unplacedPieces
        +Object piecesOnBoard
        +Object capturedPieces
        +boolean awaitingRemoval
        +string millTriggerPoint
        +string winner
        +string winReason
        +Array moveHistory
        +placePiece(player, point)
        +movePiece(player, from, to)
        +removePiece(player, point)
        +formsMillAt(point, player)
        +getRemovablePieces(player)
        +canJump(player)
        +getValidDestinations(from, player)
        +hasLegalMoves(player)
        +getLegalMoves(player)
        +getLegalActions(player)
        +makeRandomLegalMove(player, random)
        +getState()
    }

    class RateLimiter {
        +number windowMs
        +number max
        +Map hits
        +isLimited(key) boolean
        +reset(key)
        +cleanup()
    }

    class PlayerSession {
        +string gameId
        +string color
        +string username
    }

    class GameSession {
        +MuehleGame game
        +Object players
        +Timeout turnTimer
        +number turnDeadline
    }

    GameManager "1" o-- "n" GameSession : verwaltet
    GameManager "1" o-- "n" PlayerSession : mappt sockets
    GameManager "1" o-- "4" RateLimiter : verwendet
    GameSession "1" *-- "1" MuehleGame : enthält
```

### Spielfeld-Geometrie & Adjazenzmodell
Das Brett umfasst **24 Schnittpunkte** in algebraischer Notation über drei konzentrische Quadrate:
- **Äußeres Quadrat:** `a7, d7, g7, g4, g1, d1, a1, a4`
- **Mittleres Quadrat:** `b6, d6, f6, f4, f2, d2, b2, b4`
- **Inneres Quadrat:** `c5, d5, e5, e4, e3, d3, c3, c4`

```
7:  a7 ------------ d7 ------------ g7
    |                |                |
6:  |    b6 -------- d6 -------- f6   |
    |    |           |           |    |
5:  |    |   c5 ---- d5 ---- e5  |    |
    |    |   |               |   |    |
4:  a4 - b4 - c4           e4 - f4 - g4
    |    |   |               |   |    |
3:  |    |   c3 ---- d3 ---- e3  |    |
    |    |           |           |    |
2:  |    b2 -------- d2 -------- f2   |
    |                |                |
1:  a1 ------------ d1 ------------ g1
    a    b   c       d       e   f    g
```

- **32 Kanten:** 24 Kanten auf den Quadraten + 8 Kanten über die Kreuzverbindungen der Mittelpunkte (`d7-d6-d5`, `g4-f4-e4`, `d1-d2-d3`, `a4-b4-c4`).
- **16 Mühlen:** 6 horizontale Linien + 6 vertikale Linien + 4 Querverbindungen.

---

## 4. Zustandsmodelle (State Machines)

### 4.1 Spiellogik-Zustandsautomat (`MuehleGame`)

```mermaid
stateDiagram-v2
    [*] --> SETTING: Spielstart (9 Steine pro Spieler)

    state SETTING {
        [*] --> TurnWhite_Set
        TurnWhite_Set --> MillFormed_Set_W: Weiß schließt Mühle
        TurnWhite_Set --> TurnBlack_Set: Normaler Stein gesetzt

        MillFormed_Set_W --> TurnBlack_Set: Weiß schlägt schwarzen Stein

        TurnBlack_Set --> MillFormed_Set_B: Schwarz schließt Mühle
        TurnBlack_Set --> TurnWhite_Set: Normaler Stein gesetzt

        MillFormed_Set_B --> TurnWhite_Set: Schwarz schlägt weißen Stein
    }

    SETTING --> MOVING: Alle 18 Steine gesetzt (unplaced == 0)

    state MOVING {
        [*] --> TurnWhite_Move
        TurnWhite_Move --> MillFormed_Move_W: Weiß schließt Mühle
        TurnWhite_Move --> TurnBlack_Move: Stein gezogen

        MillFormed_Move_W --> TurnBlack_Move: Weiß schlägt Stein (Gegner >= 3)
        MillFormed_Move_W --> FINISHED: Schwarz auf 2 Steine reduziert!

        TurnBlack_Move --> MillFormed_Move_B: Schwarz schließt Mühle
        TurnBlack_Move --> TurnWhite_Move: Stein gezogen

        MillFormed_Move_B --> TurnWhite_Move: Schwarz schlägt Stein (Gegner >= 3)
        MillFormed_Move_B --> FINISHED: Weiß auf 2 Steine reduziert!

        TurnWhite_Move --> FINISHED: Weiß eingesperrt (0 Züge)
        TurnBlack_Move --> FINISHED: Schwarz eingesperrt (0 Züge)
    }

    MOVING --> FINISHED: Spieler gibt auf / Disconnect

    FINISHED --> [*]
```

> **Hinweis zur Phase 3 (Springen):** Ist ein Spieler in der Phase `MOVING` auf genau 3 Steine dezimiert, gilt `canJump(player) == true`. Der Zustandsautomat verbleibt in `MOVING`, die Adjazenzprüfung wird jedoch für diesen Spieler aufgehoben (freies Springen auf beliebige freie Punkte).

> **Hinweis zum Zug-Timer:** Der Ablauf der 25-Sekunden-Bedenkzeit fügt dem Automaten **keinen eigenen Zustand** hinzu. Der `GameManager` führt bei Ablauf lediglich einen der ohnehin legalen Züge aus, sodass genau dieselben Übergänge durchlaufen werden wie bei einem menschlichen Zug (siehe [5.4](#54-zug-timer--automatischer-zug)).

---

### 4.2 Client-Lifecycle-Zustandsautomat (`app.js`)

```mermaid
stateDiagram-v2
    [*] --> Screen_Login: Init / Verbindung aufgebaut
    Screen_Login --> Screen_Queue: Klick auf "Spieler suchen" (login)
    Screen_Queue --> Screen_Login: Klick auf "Abbrechen" (leaveGame)

    Screen_Queue --> Screen_Game: Event "gameStart" empfangen

    state Screen_Game {
        [*] --> Warten_Auf_Zug: Gegner am Zug
        [*] --> Eigener_Zug: Selbst am Zug
        Warten_Auf_Zug --> Eigener_Zug: Event "gameStateUpdate"
        Eigener_Zug --> Warten_Auf_Zug: Zug ausgeführt
        Eigener_Zug --> Schlagmodus: Mühle geschlossen (awaitingRemoval)
        Schlagmodus --> Warten_Auf_Zug: Stein geschlagen
    }

    Screen_Game --> Modal_GameOver: Event "gameOver" oder "opponentDisconnected"
    Modal_GameOver --> Screen_Queue: Klick auf "Erneut spielen"
    Modal_GameOver --> Screen_Login: Klick auf "Zurück zur Startseite"
```

---

## 5. Sequenzdiagramme & Interaktionsabläufe

### 5.1 Matchmaking & Verbindungsaufbau

```mermaid
sequenceDiagram
    autonumber
    actor P1 as Spieler 1 (Alice)
    participant S as Server (GameManager)
    actor P2 as Spieler 2 (Bob)

    P1->>S: emit("login", { username: "Alice" })
    Note over S: queueLimiter Prüfung<br/>Warteschlange leer -> Alice eingereiht
    S-->>P1: emit("queueWaiting", { position: 1 })

    P2->>S: emit("login", { username: "Bob" })
    Note over S: queueLimiter Prüfung<br/>Alice in Queue gefunden -> Match!
    Note over S: Zufällige Farbwahl (z.B. Alice=W, Bob=B)<br/>Crypto UUID generiert (gameId)<br/>Raum gameId erstellt

    S-->>P1: emit("gameStart", { color: "W", opponent: "Bob", state })
    S-->>P2: emit("gameStart", { color: "B", opponent: "Alice", state })
```

---

### 5.2 Spielzug, Mühlenschluss & Schlagen

```mermaid
sequenceDiagram
    autonumber
    actor P1 as Spieler Weiß (Alice)
    participant S as Server (GameManager & MuehleGame)
    actor P2 as Spieler Schwarz (Bob)

    P1->>S: emit("placePiece", { point: "a7" })
    Note over S: actionLimiter Check<br/>MuehleGame.placePiece("W", "a7")<br/>Mühle geschlossen auf [a7, d7, g7]!
    Note over S: awaitingRemoval = true
    S-->>P1: emit("gameStateUpdate", { state, lastAction: { millFormed: true } })
    S-->>P2: emit("gameStateUpdate", { state, lastAction: { millFormed: true } })

    Note over P1: UI zeigt rote Puls-Marker auf<br/>schlagbaren Steinen von Bob

    P1->>S: emit("removePiece", { point: "b6" })
    Note over S: actionLimiter Check<br/>Prüfe: Ist b6 in Bobs Mühle geschützt?<br/>b6 entfernt, piecesOnBoard.B--<br/>awaitingRemoval = false, turn = "B"
    S-->>P1: emit("gameStateUpdate", { state, lastAction: { action: "remove" } })
    S-->>P2: emit("gameStateUpdate", { state, lastAction: { action: "remove" } })
```

---

### 5.3 Verbindungsabbruch & Fehlertoleranz

```mermaid
sequenceDiagram
    autonumber
    actor P1 as Spieler Weiß
    participant S as Server
    actor P2 as Spieler Schwarz

    Note over P1: Netzwerkverlust / Tab geschlossen
    P1-xS: TCP FIN / Socket Disconnect
    Note over S: Socket.io erkennt disconnect
    Note over S: GameManager.handlePlayerDisconnect(socketId)<br/>Spieler aus socketMap entfernt<br/>Partie als FINISHED markiert<br/>Gewinner = Schwarz
    S-->>P2: emit("opponentDisconnected", { winner: "B", winReason: "Gegner getrennt" })
    Note over S: gameSession aus games-Map gelöscht<br/>Kein Serverabsturz!
```

---

### 5.4 Zug-Timer & automatischer Zug

Jede einzelne Entscheidung — Setzen, Ziehen und das Schlagen nach einer Mühle — ist auf **25 Sekunden** begrenzt (konfigurierbar über `TURN_TIMEOUT_MS`). Die Uhr gehört zur Partie, nicht zum Client: `GameManager` hält pro `GameSession` genau einen `setTimeout`, der bei jeder angenommenen Aktion über `_broadcastGameState()` neu gestellt wird.

```mermaid
sequenceDiagram
    autonumber
    actor P1 as Spieler Weiß
    participant S as Server (GameManager & MuehleGame)
    actor P2 as Spieler Schwarz

    Note over S: _startTurnTimer(gameId)<br/>setTimeout(25 s) für Weiß
    S-->>P1: emit("turnTimer", { turn: "W", durationMs: 25000 })
    S-->>P2: emit("turnTimer", { turn: "W", durationMs: 25000 })
    Note over P1,P2: Beide Clients zeichnen den Countdown-Ring

    Note over P1: Weiß zieht nicht (Denkpause, AFK, Tab im Hintergrund)

    Note over S: 25 s abgelaufen -> handleTurnTimeout(gameId)<br/>MuehleGame.getLegalActions("W")<br/>zufällige Auswahl -> placePiece / movePiece / removePiece<br/>moveHistory-Eintrag mit auto = true
    S-->>P1: emit("turnTimeout", { player: "W", autoMove })
    S-->>P2: emit("turnTimeout", { player: "W", autoMove })
    S-->>P1: emit("gameStateUpdate", { state, lastAction: { auto: true } })
    S-->>P2: emit("gameStateUpdate", { state, lastAction: { auto: true } })

    Note over S: Zug angenommen -> Uhr neu gestellt, jetzt für Schwarz
    S-->>P1: emit("turnTimer", { turn: "B", durationMs: 25000 })
    S-->>P2: emit("turnTimer", { turn: "B", durationMs: 25000 })
```

**Designentscheidung — automatischer Zug statt Zugverwirkung:** Bei Ablauf wird ein zufälliger *legaler* Zug ausgeführt (Option C des Issues), nicht der Zug verwirkt. Die Partie bleibt dadurch in Bewegung, der Spielfluss des Gegners wird nicht durch Warten blockiert, und der säumige Spieler verliert nur die freie Wahl, nicht den Zug. Der automatische Zug läuft durch dieselben Methoden wie ein menschlicher (`placePiece`, `movePiece`, `removePiece`) und ist damit zwangsläufig regelkonform; er landet regulär in der `moveHistory`, markiert mit `auto: true`.

**Weitere Eigenschaften:**

| Aspekt | Verhalten |
|---|---|
| Rücksetzung | Jede angenommene Aktion (auch der automatische Zug) startet die Uhr neu. |
| Schlagen nach Mühle | Eigene 25 Sekunden, da es eine eigene Entscheidung ist. Sonst könnte eine Partie im Zustand `awaitingRemoval` unbegrenzt blockieren. |
| Parallele Partien | Jede `GameSession` besitzt ihre eigene Uhr; Timer laufen unabhängig voneinander. |
| Spielende | `_broadcastGameState()` stoppt die Uhr, sobald ein Gewinner feststeht — ein beendetes Spiel bekommt keinen neuen Timer. |
| Verbindungsabbruch | `_endSession()` / `leaveGame()` stoppen die Uhr, bevor die Session aus `games` entfernt wird. Der Callback kann also nie auf eine Partie feuern, die es nicht mehr gibt. |
| Prozess-Lebensdauer | Alle Timer sind `unref()`-ed und halten den Node-Prozess nicht künstlich am Leben. |

**Warum serverseitig:** Ein Countdown im Browser ist manipulierbar (Debugger, angehaltener Tab, verändertes Skript) und damit als Regel wertlos. Der Client erhält deshalb nur die Restzeit und zeichnet sie; die Entscheidung über den Ablauf trifft ausschließlich der Server.

---

## 6. Schnittstellenspezifikation (Socket.io-Protokoll)

### Client ➔ Server Events

| Event | Payload | Validierung & Vorbedingungen | Antwort / Reaktion |
|:---|:---|:---|:---|
| `login` | `{ username: string }` | Queue-Rate-Limit aktiv; String getrimmt (max. 20 Zeichen) | `queueWaiting` oder `gameStart` |
| `placePiece` | `{ point: string }` | Phase `SETTING`; `turn == player`; Punkt in `POINTS` & frei | `gameStateUpdate` oder `actionError` |
| `movePiece` | `{ from: string, to: string }` | Phase `MOVING`; `board[from] == player`; Ziel frei; Nachbar oder Jump | `gameStateUpdate` oder `actionError` |
| `removePiece` | `{ point: string }` | `awaitingRemoval == true`; Stein gehört Gegner; Mühlenschutz beachtet | `gameStateUpdate` oder `actionError` |
| `forfeit` | *(kein)* | Spieler in aktivem Spiel | `gameOver` mit Forfeit-Grund |
| `chatMessage` | `{ text: string }` | Chat-Rate-Limit aktiv; Text getrimmt (max. 150 Zeichen) | Broadcast `chatMessage` an Raum |
| `leaveGame` | *(kein)* | Spieler verlässt beendetes Spiel | Bereinigung der Session |
| `disconnect` | *(Transport)* | Automatisch bei Verbindungsverlust | `opponentDisconnected` an verbleibenden Spieler |

### Server ➔ Client Events

| Event | Payload | Beschreibung |
|:---|:---|:---|
| `queueWaiting` | `{ position: number, message: string }` | Bestätigt Warteschlangenplatz |
| `gameStart` | `{ gameId, yourColor, yourName, opponentName, state }` | Startet Spielarena und teilt Farben zu |
| `gameStateUpdate` | `{ state: Object, lastAction: Object }` | Überträgt autoritativen Spielzustand (`lastAction.auto === true` bei einem Zug, den die Uhr ausgelöst hat) |
| `turnTimer` | `{ turn, awaitingRemoval, durationMs, remainingMs }` | Startet/erneuert den Countdown; wird nach jeder angenommenen Aktion gesendet |
| `turnTimeout` | `{ player, timeoutMs, action, autoMove, message }` | Die Bedenkzeit ist abgelaufen; nennt den Spieler und den automatisch ausgeführten Zug |
| `gameOver` | `{ winner: string, winnerName: string, winReason: string, state }` | Zeigt Spielende-Modal an |
| `opponentDisconnected`| `{ winner, winnerName, winReason, state }` | Informiert über Verbindungsabbruch des Gegners |
| `actionError` | `{ message: string }` | Informiert den Client über Regelverstoß oder Rate-Limit |
| `serverError` | `{ message: string }` | Informiert über Server- oder Warteschlangenüberlastung |
| `chatMessage` | `{ sender: string, color: string, text: string, timestamp: number }` | Übermittelt Chatnachricht an beide Clients |

---

## 7. Sicherheits- & Resilienzmodell

```mermaid
graph TD
    subgraph Schutzebenen["Mehrstufiges Schutzkonzept"]
        T1["1. Transportebene: maxHttpBufferSize (10 KB Limit) & express.json Limit"]
        T2["2. Rate-Limiting: Sliding-Window Token-Bucket pro IP & Socket"]
        T3["3. DoS-Abwehr: Obergrenzen (maxQueueSize: 500, maxActiveGames: 1000)"]
        T4["4. Call-Stack-Schutz: Iterative Queue-Bereinigung statt Rekursion"]
        T5["5. Integrität: 100% Autoritatives Servermodell (keine Client-Manipulation)"]
        T6["6. XSS-Schutz: Serverseitige HTML-Sanitization & Client-Entity-Escaping"]
        T7["7. Entropie: Kryptografische UUIDs (crypto.randomUUID)"]
    end
```

### Implementierte Härtungsmaßnahmen
1. **DoS- und Overflow-Schutz (DOS-01 & DOS-03):**
   - WebSocket-Payloads sind über `maxHttpBufferSize: 1e4` (10 KB) abgeriegelt.
   - `enqueuePlayer()` nutzt eine iterative `while`-Schleife zur Bereinigung veralteter Sockets, wodurch selbst bei 5.000 getrennten Sockets kein `RangeError: Maximum call stack size exceeded` ausgelöst wird.
   - Die Warteschlange ist auf maximal 500 Einträge, aktive Spiele auf maximal 1.000 Instanzen limitiert.
   - Anmeldungen sind auf 5 pro 5 Sekunden je Socket und 20 pro 5 Sekunden je Adresse gedrosselt. Das Adressbudget ist bewusst größer, damit sich Spieler hinter derselben NAT-Adresse (gleiches WLAN, zwei Tabs) nicht gegenseitig ausbremsen.
2. **Anti-Spam & Rate-Limiting (CH-05):**
   - Chatnachrichten sind auf maximal 4 Nachrichten pro 2 Sekunden gedrosselt. Bei über 10 wiederholten Verstößen wird der Socket automatisch zwangsgetrennt (`socket.disconnect(true)`).
3. **Zustandsintegrität (MQ-04 & MQ-05):**
   - Das Spielbrett wird ausschließlich über die Server-Engine `MuehleGame` verändert.
   - Züge werden zwingend an die Socket-Identität gekoppelt; fremde Züge oder State-Injektionen sind strukturell unmöglich.
   - Auch die Bedenkzeit ist Serverzustand: Der Zug-Timer läuft im `GameManager`, der Client zeigt nur die gemeldete Restzeit an. Ein manipulierter oder angehaltener Client verschafft sich damit keine zusätzliche Zeit (siehe [5.4](#54-zug-timer--automatischer-zug)).
4. **Fehlertoleranz:**
   - Alle Socket-Handler sind in `try/catch`-Blöcken gekapselt.
   - Unhandled Rejections und unvorhergesehene Ausnahmen werden über globale Exception-Handler abgefangen, sodass der Node.js-Prozess niemals abstürzt.
