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
    subgraph Frontend["Frontend (Vanilla Web Stack)"]
        HTML["index.html (SPA Screens)"]
        CSS["style.css (Layout >= 1024x768 & SVG-Styles)"]
        APP["app.js (Client Controller & Socket Handler)"]
        BR["boardRenderer.js (SVG Renderer & Hitboxen)"]
        AU["audio.js (Web Audio API Synthesizer)"]
    end

    subgraph Backend["Backend (Node.js & Express)"]
        SRV["server.js (Dual-Stack Bootstrap & Socket Events)"]
        MGR["GameManager.js (Rooms, Queues, Lifecycle)"]
        RTL["RateLimiter.js (Sliding-Window Limiter)"]
        MHL["MuehleGame.js (Regelwerk, Adjazenz, Mühlen)"]
    end

    HTML --> APP
    CSS --> HTML
    APP --> BR
    APP --> AU
    APP <-->|WebSocket Events| SRV
    SRV --> MGR
    MGR --> RTL
    MGR --> MHL
```

### Komponentenbeschreibung

#### Serverseitige Module
- **`server.js`**: Initialisiert Express, serviert statische Dateien (`/public`), konfiguriert Socket.io mit Payload-Grenzen (`maxHttpBufferSize: 10KB`), bindet das Dual-Stack IPv6/IPv4-Netzwerk und fängt Ausnahmen global ab.
- **`lib/GameManager.js`**: Verwaltet die Matchmaking-Warteschlange, Socket-zu-Spieler-Mappings (`socketMap`), Räume (`games`) und koordiniert Event-Aufrufe.
- **`lib/MuehleGame.js`**: Rein deterministische, autoritative Mühle-Regel-Engine. Verwaltet das Brett (24 Punkte), 32 Adjazenzkanten, 16 Mühlenlinien und validiert Setzen, Ziehen, Springen sowie Sieg-/Verlustbedingungen.
- **`lib/RateLimiter.js`**: In-Memory Sliding-Window Token-Bucket-Filter zum Schutz vor Chat-Floods (CH-05), Queue-Flooding (DOS-01) und Aktions-Spam.

#### Clientseitige Module
- **`public/js/app.js`**: Haupt-Controller für Socket.io-Client, Screen-Wechsel (Login, Queue, Game, Game Over), UI-Aktualisierung und Toast-Nachrichten.
- **`public/js/boardRenderer.js`**: Dynamischer SVG-Renderer. Verankert jeden Knotenpunkt per `transform="translate(x, y)"` und steuert konzentrische Ziel-, Auswahl- und Schlaganimationen.
- **`public/js/audio.js`**: Reiner Web-Audio-API Synthesizer für Soundeffekte (Klicks, Züge, Mühlenklang, Schlag-Impact, Fanfaren).

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
        +RateLimiter chatLimiter
        +RateLimiter queueLimiter
        +RateLimiter actionLimiter
        +enqueuePlayer(socket, username)
        +dequeuePlayer(socketId)
        +handlePlacePiece(socket, point)
        +handleMovePiece(socket, from, to)
        +handleRemovePiece(socket, point)
        +handleChatMessage(socket, text)
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
    }

    GameManager "1" o-- "n" GameSession : verwaltet
    GameManager "1" o-- "n" PlayerSession : mappt sockets
    GameManager "1" o-- "3" RateLimiter : verwendet
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
| `gameStateUpdate` | `{ state: Object, lastAction: Object }` | Überträgt autoritativen Spielzustand |
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
2. **Anti-Spam & Rate-Limiting (CH-05):**
   - Chatnachrichten sind auf maximal 4 Nachrichten pro 2 Sekunden gedrosselt. Bei über 10 wiederholten Verstößen wird der Socket automatisch zwangsgetrennt (`socket.disconnect(true)`).
3. **Zustandsintegrität (MQ-04 & MQ-05):**
   - Das Spielbrett wird ausschließlich über die Server-Engine `MuehleGame` verändert.
   - Züge werden zwingend an die Socket-Identität gekoppelt; fremde Züge oder State-Injektionen sind strukturell unmöglich.
4. **Fehlertoleranz:**
   - Alle Socket-Handler sind in `try/catch`-Blöcken gekapselt.
   - Unhandled Rejections und unvorhergesehene Ausnahmen werden über globale Exception-Handler abgefangen, sodass der Node.js-Prozess niemals abstürzt.
