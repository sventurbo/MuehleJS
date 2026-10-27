# Mühle – Multiplayer im Browser

[![CI](https://github.com/sventurbo/MuehleJS/actions/workflows/node.js.yml/badge.svg)](https://github.com/sventurbo/MuehleJS/actions/workflows/node.js.yml)
![Node.js 22.18+ / 24.2+](https://img.shields.io/badge/Node.js-22.18%2B%20%2F%2024.2%2B-339933)
[![Lizenz: MIT](https://img.shields.io/badge/Lizenz-MIT-blue)](LICENSE)

Das klassische Strategiespiel **Mühle** (*Nine Men's Morris*) für zwei Personen, gespielt in
Echtzeit über den Browser. Entstanden als Portfolioaufgabe im Modul Web-Entwicklung (DHBW).

- **Frontend**: reines HTML, CSS und JavaScript ohne Framework und ohne Build-Schritt
- **Backend**: Node.js mit Express und Socket.io
- **Spielablauf**: anmelden, automatisch einen Gegner zugeteilt bekommen, losspielen

> **Schnellstart**
>
> ```bash
> npm install && npm run build && npm start   # danach http://localhost:3000 öffnen
> ```

## Inhalt

1. [Spielregeln](#-spielregeln)
2. [Funktionen](#-funktionen)
3. [Installation und Start](#-installation-und-start)
4. [Konfiguration](#-konfiguration)
5. [Zug-Timer](#-zug-timer)
6. [Tests und Qualitätssicherung](#-tests-und-qualitätssicherung)
7. [Architektur](#-architektur)
8. [Projektstruktur](#-projektstruktur)
9. [Lizenz](#-lizenz)

Architektur, Zustandsautomaten und das Socket.io-Protokoll beschreibt
[Systemmodel.md](Systemmodel.md) ausführlich als Mermaid-Diagramme.

---

## 📜 Spielregeln

Jeder Spieler hat **9 Steine**. Ziel ist es, den Gegner auf **2 Steine** zu reduzieren oder
ihn so einzusperren, dass er keinen legalen Zug mehr hat.

| Phase | Was passiert |
|---|---|
| **1 · Setzen** | Beide setzen abwechselnd je einen Stein auf einen freien Punkt, bis alle 18 Steine liegen. |
| **2 · Ziehen** | Ein eigener Stein zieht entlang einer Linie auf ein freies Nachbarfeld. |
| **3 · Springen** | Wer nur noch 3 Steine hat, darf auf jedes freie Feld springen. |

- **Mühle**: Drei eigene Steine in einer geraden Reihe bilden eine Mühle. Wer sie schließt, schlägt
  sofort einen gegnerischen Stein. Steine in Mühlen sind geschützt, außer der Gegner hat
  ausschließlich Steine in Mühlen.
- **Remis**: Die Partie endet unentschieden, wenn in der Zugphase dieselbe Stellung (gleiches Brett,
  gleicher Spieler am Zug) zum dritten Mal entsteht oder 50 Züge lang kein Stein geschlagen wird.
  Ohne diese Regeln könnten zwei Spieler endlos hin und her ziehen.
- **Bedenkzeit**: Jede Entscheidung hat 25 Sekunden. Wer dreimal in Folge die Zeit überschreitet,
  verliert (siehe [Zug-Timer](#-zug-timer)).

---

## ✨ Funktionen

### Spiel

- **Vollständige Regeln**: alle drei Phasen, Mühlenerkennung, Mühlenschutz samt Ausnahme, Sieg durch
  Dezimieren oder Einsperren, Remis durch Stellungswiederholung oder 50 Züge ohne Schlagen.
- **Automatisches Matchmaking**: Sobald sich ein zweiter Spieler anmeldet, werden beide gepaart und
  die Partie startet in einem eigenen Raum. Beliebig viele Partien laufen parallel.
- **Zug-Timer**: 25 Sekunden pro Entscheidung, gemessen allein vom Server. Läuft die Zeit ab, zieht
  der Server zufällig, aber legal.
- **Live-Chat und Zugprotokoll** neben dem Brett.

### Oberfläche

- **Eine Statuszeile statt vieler Anzeigen**: Phase und Anweisung stehen in einem Satz über dem
  Brett, die Farbe zeigt, wer am Zug ist. Die Bedenkzeit läuft wie bei einer Schachuhr als Ring in
  der Karte des Spielers am Zug. Das Brett gewinnt dadurch Höhe (bei 1024 × 768 rund 450 statt 396 px).
- **SVG-Spielfeld**, gestochen scharf in jeder Größe. Auswahlring, Zielmarker und Mühle-Strahl sind
  ruhige, statische oder einmalig eingeblendete Marker.
- **Animierte Steine**: Ein gesetzter Stein springt kurz auf, ein gezogener gleitet leicht angehoben
  zum Ziel (auch beim Springen), ein geschlagener blendet aus. Der Renderer patcht das Brett, statt
  es neu aufzubauen: Liegen bleibende Steine behalten ihren SVG-Knoten.
- **Rückmeldung am Brett**: Ein wirkungsloser Klick (besetztes Feld, Gegner am Zug, kein Weg zum
  Ziel) lässt den Punkt kurz wackeln und rot aufleuchten, statt einen Hinweis einzublenden.
- **Anmeldung als echtes Formular**: Der Browser prüft den Namen (`required`, `pattern`,
  `maxlength`), Enter schickt ab, der Server prüft erneut. Der zuletzt genutzte Name wird gemerkt.
- **Native `<dialog>`-Dialoge** für Regeln, Aufgeben und Spielende: Top Layer, gesperrte Seite
  dahinter, Esc schließt. Regeln und Aufgeben öffnen und schließen per **Invoker Commands**
  (`command`/`commandfor`) ganz ohne JavaScript; Aufgeben fragt in einem eigenen Dialog nach statt
  über `confirm()`.
- **Light- und Dark-Theme** über `color-scheme` und `light-dark()`: Ein Token-Block trägt beide
  Themes, der Browser folgt der Systemeinstellung, auch das Brett.
- **Ruhiges Design-System**: neutrale Flächen, ein Akzentton (Blau), Haarlinien-Ränder,
  4-pt-Abstandsraster und durchscheinende Materialien (`backdrop-filter`) statt Glow-Effekten.
- **Keine externen Assets**: Icons sind Inline-SVG in `currentColor` (keine Emoji, keine
  Icon-Fonts), Soundeffekte entstehen per Web-Audio-Synthesizer.
- **Barrierearm**: Kontraste nach WCAG 2.1 AA (automatisch geprüft), `prefers-reduced-motion` wird
  respektiert, auch von den Stein-Animationen. Das Brett ist per Tastatur bedienbar: Pfeiltasten
  bewegen den Fokus von Punkt zu Punkt, Enter und Leertaste setzen oder ziehen wie ein Klick.

### Desktop und Smartphone

- **Desktop ab 1024 × 768**: Die ganze Spielfläche passt ohne Scrollen ins Fenster und wächst mit
  größeren Bildschirmen.
- **Smartphone bis 320 px Breite** (Referenzgerät iPhone):
  - Eigene Touch-Layouts bis 700 px Breite: Name und „Spieler suchen“ in eigenen Zeilen,
    beide Spielerkarten in einer kompakten Zeile über dem Brett, das Brett in voller Breite.
  - Zugprotokoll und Chat teilen sich eine Tab-Leiste mit Ungelesen-Markierung.
  - Im Querformat flankieren die Spielerkarten das Brett, dessen Größe sich nach der kurzen
    Bildschirmkante richtet.
  - Feinheiten: `viewport-fit=cover` und `env(safe-area-inset-*)` für Notch und Home-Indicator,
    `100dvh` gegen die einklappende Browser-Leiste, 16-px-Eingabefelder (kein Auto-Zoom),
    entsperrter Audio-Kontext beim ersten Tap, Web App Manifest für den Home-Bildschirm.
  - Touch-Bedienung: Tippziele ab 44 px, vergrößerte Trefferflächen auf dem Brett, Druck- statt
    Hover-Feedback (Hover-Stile gelten nur für echte Zeigegeräte).

### Robustheit und Sicherheit

- **Der Server ist autoritativ**: Er prüft jede Aktion, dem Client wird nie vertraut.
- **Der Server stürzt nicht ab**: `try/catch`-Guards und globale Exception-Handler. Bricht eine
  Verbindung ab, endet die Partie sofort: Der verbliebene Spieler gewinnt und wird benachrichtigt,
  der getrennte kehrt zur Anmeldung zurück.
- **DoS-Schutz**: Ein In-Memory-Rate-Limiter (Sliding Window) bremst Spam auf Socket.io-Ebene.
  Anmeldeversuche zählen pro Verbindung und pro Adressblock (siehe
  [Reverse Proxy](#betrieb-hinter-einem-reverse-proxy)); das Adressbudget reicht für einen ganzen
  Kurs hinter einer NAT-Adresse. HTTP-Request-Bodies liest der Server gar nicht erst.
- **Eingabesäuberung**: Der Server prüft jede Eingabe auf Typ und Länge und entfernt
  Steuerzeichen; der Client gibt fremde Texte nur escaped aus.
- **IPv6 und IPv4**: Der Server lauscht auf `::` im Dual-Stack-Modus und startet bei Bedarf einen
  eigenen IPv4-Listener (siehe [Netzwerk](#netzwerk-ipv6-und-ipv4)).

### Nur aktuelle Standards

Das Spiel läuft auf den **jeweils aktuellen Versionen** von Chrome, Firefox und Safari, auf dem
Desktop wie auf iOS und Android. Rückwärtskompatibilität gibt es bewusst nicht: keine
Vendor-Präfixe, keine Fallback-Deklarationen, keine Feature-Erkennung, ES-Module statt globaler
Skripte. `tests/ModernStandards.test.js` wacht darüber.

---

## 🚀 Installation und Start

**Voraussetzung**: Node.js **22.18 oder neuer** (in der 24er-Linie ab 24.2) mit npm. Das reicht
von dem Node.js, das Ubuntu 26.04 LTS über `apt install nodejs npm` mitbringt (22.22), über die
aktuelle LTS-Version 24 bis zur neuesten Version 26, mit der das Projekt entwickelt wird. Das
Projekt läuft auf jedem System mit Node.js, etwa Ubuntu, Debian oder macOS.

```bash
npm install        # 1. Abhängigkeiten installieren
npm run build      # 2. Build (kein Bundler nötig, schließt sofort ab)
npm start          # 3. Server starten, Standardport 3000
```

Danach ist das Spiel erreichbar unter:

| Protokoll | Adresse |
|---|---|
| IPv4 | `http://127.0.0.1:<port>` oder die IPv4-Adresse des Servers |
| IPv6 | `http://[::1]:<port>` oder die öffentliche IPv6-Adresse des Servers |

### Anderer Port

```bash
npm start 8080          # Port als Argument
node server.js 8080     # dasselbe ohne npm
PORT=8080 npm start     # Port als Umgebungsvariable
```

Vorrang hat der Port auf der Kommandozeile, dann `PORT` aus der Shell, dann `PORT` aus `.env`,
zuletzt der Standard `3000`. Die Datei `.env` liest nur `npm start`, nicht `node server.js`.

<details>
<summary><strong>Warum <code>npm install</code> auf alten Node-Versionen abbricht</strong></summary>

<br>

Die Anforderung steht in `package.json` unter `engines` (`^22.18.0 || >=24.2.0`) und wird über
`.npmrc` (`engine-strict=true`) durchgesetzt: `npm install` bricht auf einer älteren Node-Version
sofort mit einer klaren `EBADENGINE`-Meldung ab, statt später an unpassender Stelle zu scheitern.
Die Untergrenze ist die erste Version mit `import.meta.main`, mit dem `server.js` erkennt, dass es
gestartet und nicht nur von einem Test importiert wurde. Ohne diese Prüfung endete der Server auf
einer zu alten Version still, ohne zu lauschen. Die CI prüft jede zugelassene Linie (22, 24 und
26), `tests/Environment.test.js` hält die Grenze fest.

npm führt Installationsskripte von Abhängigkeiten nur aus, wenn `allowScripts` in `package.json`
sie erlaubt. Die beiden Jest-Abhängigkeiten `@parcel/watcher` und `unrs-resolver` sind dort
ausdrücklich abgelehnt: Ihre Skripte bauen native Binärdateien nur als Fallback, wenn die
mitgelieferten fehlen. ESLint, Prettier und ihre Abhängigkeiten bringen keine Installationsskripte
mit und brauchen daher keinen Eintrag.

</details>

---

## 🔧 Konfiguration

Alle Einstellungen sind optional und kommen aus Umgebungsvariablen. Damit sie nicht bei jedem Start
angegeben werden müssen, können sie in einer Datei `.env` im Projektverzeichnis stehen:

```bash
cp .env.example .env   # Vorlage kopieren, dann die gewünschte Zeile einkommentieren
```

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | `3000` | Port des Servers (IPv6 und IPv4) |
| `TRUST_PROXY` | nicht gesetzt | Vertrauenswürdige Reverse Proxys, siehe [unten](#betrieb-hinter-einem-reverse-proxy) |
| `TURN_TIMEOUT_MS` | `25000` | Bedenkzeit pro Entscheidung in Millisekunden, siehe [Zug-Timer](#-zug-timer) |

`npm start` lädt die Datei mit der in Node.js eingebauten Option `--env-file-if-exists=.env`, ein
Paket wie `dotenv` ist nicht nötig. Fehlt die Datei, meldet Node das in einer Zeile, und der Server
startet mit den Standardwerten. In `.env.example` ist jede Zeile auskommentiert, eine unveränderte
Kopie ändert also nichts. `.env` steht in `.gitignore` und wird nie committet;
`tests/Environment.test.js` prüft, dass `.env.example` jede Variable dokumentiert, die `server.js`
liest.

### Betrieb hinter einem Reverse Proxy

Anmeldeversuche werden auch pro Client-Adresse begrenzt. Standardmäßig zählt die Adresse, von der
die Verbindung tatsächlich kommt. Den Header `X-Forwarded-For` ignoriert der Server, denn jeder
Client kann ihn selbst setzen und sich so für jede Verbindung eine neue Adresse ausdenken.

Hinter einem Reverse Proxy (nginx, Caddy, Traefik …) kämen aber alle Verbindungen vom Proxy, und
alle Spieler teilten sich ein Budget. Deshalb legt `TRUST_PROXY` fest, welchen Proxys der Server den
Header glaubt:

| Wert | Bedeutung |
|---|---|
| nicht gesetzt, `false` oder `0` | Standard: `X-Forwarded-For` wird ignoriert. |
| Adressen oder Netze, kommagetrennt (z. B. `127.0.0.1` oder `10.0.0.0/8,fd00::/8`) | Nur Verbindungen von diesen Proxys dürfen die Client-Adresse nennen. Zusätzlich gibt es die Kurzformen `loopback`, `linklocal` und `uniquelocal`. |
| Anzahl `n` (z. B. `1`) | Die `n` Hops direkt vor dem Server gelten als Proxys, egal von welcher Adresse sie kommen. |

```bash
TRUST_PROXY=loopback npm start   # z. B. für einen nginx auf demselben Rechner
```

<details>
<summary><strong>Details: Auswertung des Headers und Adressblöcke</strong></summary>

<br>

Der Server liest die Kette in `X-Forwarded-For` von rechts nach links: Jeder Eintrag eines
vertrauten Proxys wird übersprungen, der erste andere ist der Client. Bei `TRUST_PROXY=10.0.0.1`,
einer Verbindung von `10.0.0.1` und `X-Forwarded-For: 198.51.100.1, 203.0.113.7` zählt also
`203.0.113.7`; `198.51.100.1` hat der Client selbst mitgeschickt und wird verworfen. Kommt eine
Verbindung nicht von einem vertrauten Proxy, bleibt der Header unbeachtet.

- `TRUST_PROXY=true` wird abgelehnt: Dann wäre jeder Hop vertrauenswürdig, und es zählte der linke
  Eintrag, den der Client selbst schreibt. Auch ungültige Adressen brechen den Start mit einer
  Fehlermeldung ab.
- Der Proxy muss die Adresse, von der er angesprochen wird, an den Header anhängen oder ihn damit
  überschreiben (nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`).
- Mit einer Anzahl statt Adressen darf der Node-Port nicht direkt erreichbar sein, sonst umgeht ein
  Client den Proxy und füllt den Header selbst. Eine Adressliste ist in diesem Punkt robuster.

Die so ermittelte Adresse zählt nicht für sich allein, sondern für ihren Block: IPv4 und
IPv4-mapped IPv6 (`::ffff:a.b.c.d`) werden auf die reine IPv4-Adresse abgebildet, natives IPv6 auf
sein `/64`-Präfix (z. B. `2001:db8:1:2::/64`). Ein IPv6-Client verfügt in der Regel über mindestens
ein ganzes `/64`; ohne diese Zusammenfassung stünden ihm pro Verbindung eine frische Adresse und
damit beliebig viele Budgets zur Verfügung.

</details>

### Netzwerk: IPv6 und IPv4

Der Server bindet an `::` (IPv6 Unspecified). Node.js öffnet diesen Socket als Dual-Stack-Socket
(die Option `ipv6Only` von `listen()` ist standardmäßig aus, auch bei
`net.ipv6.bindv6only = 1`), er nimmt also auch IPv4-Verbindungen an (als IPv4-mapped IPv6). Die
übrigen Fälle behandelt `server.js` selbst:

| Situation | Verhalten |
|---|---|
| Rechner ohne IPv6 (z. B. Kernel mit `ipv6.disable=1`) | `::` scheitert mit `EAFNOSUPPORT`, der Server lauscht auf `0.0.0.0` |
| System, das IPv4 nicht über einen IPv6-Socket annimmt | ein zweiter Listener auf `0.0.0.0` übernimmt IPv4 |
| Port belegt, ohne Rechte (z. B. 80) oder ungültig | klare Fehlermeldung und Exit-Code 1, kein stiller Fallback |

An jeden Listener wird Socket.io angebunden. So ist das Spiel in jedem Fall über **beide
Protokolle** erreichbar, auch auf einem reinen IPv4-Rechner.

---

## ⏳ Zug-Timer

Ohne Zeitlimit könnte ein Spieler, der nicht zieht, die ganze Partie blockieren. Deshalb hat jede
Entscheidung ein Budget von **25 Sekunden**:

| Situation | Was die Uhr misst |
|---|---|
| Setzphase | Zeit bis zum Setzen eines Steins |
| Zug- und Springphase | Zeit bis zum Ziehen eines Steins |
| Nach einer geschlossenen Mühle | Zeit bis zur Wahl des zu schlagenden Steins |

**So läuft es ab:**

1. Mit dem Spielstart beginnt die Uhr für Weiß. Jede angenommene Aktion setzt sie zurück, danach
   läuft sie für den nächsten Zug.
2. Bei jedem Neustart der Uhr schickt der Server `turnTimer` an beide Clients. Sie zeigen den
   Countdown als schrumpfenden Ring in der Karte des Spielers am Zug.
3. Läuft die Zeit ab, wählt der Server über `MuehleGame.makeRandomLegalMove()` einen **zufälligen
   legalen Zug** und führt ihn aus, geprüft von derselben Regel-Engine wie menschliche Züge.
4. Beide Clients erhalten `turnTimeout` (wer die Zeit überschritten hat, welcher Zug ausgeführt
   wurde) und das übliche `gameStateUpdate`. Im Zugprotokoll steht der Zug mit dem Zusatz
   *(automatisch)*.
5. Danach läuft die Uhr für den Gegner. Jede Partie hat ihre eigene Uhr; endet die Partie oder
   verlässt ein Spieler sie, wird die Uhr gestoppt.
6. Überschreitet derselbe Spieler die Zeit **dreimal in Folge**, zieht der Server nicht mehr für ihn:
   Er verliert, beide Clients erhalten `gameOver`. Jede eigene Aktion setzt den Zähler zurück.
   `turnTimeout` nennt dafür `consecutiveTimeouts` und `timeoutLimit`, und der Betroffene sieht im
   Hinweis, wie oft es schon passiert ist. Der Hinweis bleibt stehen, bis er angeklickt wird: Wer die
   Zeit überschritten hat, war gerade nicht am Bildschirm und soll ihn trotzdem sehen.

> **Warum nur auf dem Server?** Ein Countdown im Browser lässt sich anhalten, verlangsamen oder
> entfernen. Der Client bekommt daher nur die verbleibende Zeit und zeichnet sie; ob ein Zug
> abgelaufen ist, entscheidet allein der Server.

### Zugzeit anpassen

```bash
TURN_TIMEOUT_MS=60000 npm start   # 60 Sekunden pro Zug
```

Ohne Angabe gelten 25 000 ms. Werte, die keine positive Zahl sind (Tippfehler, leere Variable, `0`,
negative Werte), fallen auf diesen Standard zurück. Der Timer lässt sich über die Umgebung also
nicht versehentlich abschalten.

---

## 🧪 Tests und Qualitätssicherung

```bash
npm test                 # Jest: 367 Tests in 13 Dateien
npm run lint             # ESLint: Fehler und toter Code
npm run format:check     # Prettier: prüft die Formatierung, ändert nichts
npm run format           # Prettier: formatiert alle Dateien
npm run contrast-check   # WCAG 2.1 AA: Kontrast aller Farbpaare
```

Alle Prüfungen laufen auch in der CI (`.github/workflows/node.js.yml`). Da alle Quellen ES-Module
sind, läuft Jest im ESM-Modus (`--experimental-vm-modules`, im `test`-Skript bereits gesetzt).

<details>
<summary><strong>Was die Tests abdecken</strong></summary>

<br>

**Spielregeln**
- Vollständige Geometrie (24 Punkte, 32 Kanten, 16 Mühlen).
- Setzphase, Zugphase, Springphase (bei 3 Steinen).
- Mühlenerkennung und Schlag-Regeln (inkl. Mühlenschutz-Ausnahme).
- Sieg durch Steinedezimierung (< 3 Steine) und durch Einsperren (keine legalen Züge).
- Remis durch dreifache Stellungswiederholung und nach 50 Zügen ohne Schlagen; ein Schlag setzt
  beide Zähler zurück.
- Identität des geteilten Regelmoduls (`shared/muehleRules.js`) mit der Server-Engine: Beide Seiten
  benutzen dasselbe Objekt, nicht zwei Kopien.

**Server**
- Matchmaking-Warteschlange und Sitzungsisolation.
- Zug-Timer: Ablauf nach 25 Sekunden, Zurücksetzen bei jedem Zug, automatischer legaler Zug (auch
  beim Schlagen), Niederlage nach drei Zeitüberschreitungen in Folge, unabhängige Uhren paralleler
  Partien und ein gestoppter Timer bei Verbindungsabbruch (`jest.useFakeTimers()`).
- Verbindungsabbruch und saubere Beendigung.
- Vollständiger Client-Server-Integrationsfluss über WebSockets.
- Sicherheit und DoS-Schutz (Rate Limiting inkl. Adressblock-Budget, Anmeldung eines ganzen Kurses
  hinter einer NAT-Adresse und Proxy-Vertrauen, Eingabesäuberung, keine Body-Parser).
- Konfiguration: `.env.example` dokumentiert jede Umgebungsvariable des Servers, `npm start` lädt
  `.env`, und ein Port auf der Kommandozeile hat Vorrang.
- Build und Start: `engines` lässt das Node.js von Ubuntu 26.04 LTS, die LTS-Version und die
  neueste Version zu und die CI prüft die älteste davon; ein belegter oder ungültiger Port beendet
  den Start mit Exit-Code 1.

**Client**
- Brett-Diff für die Stein-Animationen: Jede Aktion zufällig gespielter Partien wird als genau das
  Setzen, Ziehen oder Schlagen erkannt.
- Responsives Mobile-Layout (Viewport-Meta, Touch-Zielgrößen, Safe-Area, Tab-Leiste, Hover-Gating)
  und die Statuszeile mit der Uhr in jeder Spielerkarte.
- Anmeldeformular (`required`, `pattern`, Absenden per `submit`, gemerkter Name), die Rückmeldung am
  Brett statt Toasts bei wirkungslosen Klicks und der Hinweis auf einen automatischen Zug, der bis
  zum Anklicken stehen bleibt.
- Ton-Einstellung auch bei blockiertem `localStorage` (abgeschaltete Website-Daten); ein
  verweigertes Audiogerät lässt das Spiel nur stumm, ohne unbehandelte Promise-Ablehnung.
- Vollständigkeit und Auswertungsreihenfolge des Client-Modulgraphen (ab `js/app.js`) sowie die
  Architekturregel, dass nur `app.js` mit dem Socket spricht; ein Verbindungsabbruch beendet die
  Partie sofort, eine unbekannte Partie (`gameNotFound`) führt zurück zur Anmeldung, und eigene
  Chatnachrichten werden an der Farbe erkannt, nicht am Namen.
- Tastaturbedienung des Bretts: Fokusführung mit den Pfeiltasten, Auslösen mit Enter und Leertaste.

**Standards**
- Keine Rückwärtskompatibilität: keine Vendor-Präfixe oder Fallback-Paare im CSS, keine
  Vendor-Metatags, nur ES-Module, keine Feature-Erkennung, Node-Built-ins über `node:`.
- Aktuelle Standards statt älterer Idiome: native Dialoge mit Invoker Commands statt `confirm()`,
  `hidden`-Attribut statt `.hidden`-Klasse, `light-dark()`-Tokens, Media Queries als Bereiche
  (`width <= 700px`), Farben in `oklch()` und abgeleitete per `color-mix()`, private `#`-Methoden,
  Cascade Layers statt `!important`, keine Inline-Styles.

</details>

<details>
<summary><strong>Linter, Formatter und Kontrastprüfung im Detail</strong></summary>

<br>

**ESLint** (Flat Config in `eslint.config.js`) prüft mit den empfohlenen Regeln plus `no-var`,
`prefer-const` und `eqeqeq`. Welche globalen Namen erlaubt sind, hängt davon ab, wo eine Datei
läuft: Browser-Globals für `public/js`, nur die in Browser und Node gemeinsamen für `shared/`, Node
für Server, Skripte und Konfiguration, Node und Jest für die Tests.

**Prettier** (`prettier.config.js`) bildet den bestehenden Stil nach: einfache Anführungszeichen
(im CSS doppelte), Semikolons, zwei Leerzeichen, keine Trailing Commas, 120 Zeichen pro Zeile.
`index.html` und die Markdown-Dokumente nimmt `.prettierignore` aus: Prettier würde leere
HTML-Elemente im XHTML-Stil (`<meta … />`) schließen und Tabellenspalten auf die breiteste Zelle
auffüllen.

**Der Kontrast-Checker** prüft alle Farbpaare im Light- und Dark-Theme gegen WCAG 2.1 AA. Die Tokens
liest er aus dem `:root`-Block von `public/css/tokens.css` über `scripts/css-bundle.js`, das die
`@import`-Kette auflöst. Jedes `light-dark(<hell>, <dunkel>)`-Paar teilt er in seine beiden Themes
auf und löst `var()`-Verweise zwischen Tokens auf. Farben liest er als Hex, `rgb()`, `oklch()` und
`color-mix()`. Mehr dazu in [docs/contrast-check.md](docs/contrast-check.md).

</details>

---

## 🧱 Architektur

```
Browser                                  Server (Node.js)
───────                                  ────────────────
index.html → js/app.js  ◀── Socket.io ──▶  server.js → lib/GameManager.js → lib/MuehleGame.js
              │                                                                │
              └────────── shared/muehleRules.js (ein Regelmodul für beide) ────┘
```

### Server

- **`server.js`** ist ein schlanker Einstieg: Er liefert die Dateien aus, übersetzt Socket-Events in
  `GameManager`-Aufrufe und bindet das Netzwerk.
- **`lib/GameManager.js`** paart Spieler, verwaltet die parallelen Spielräume und führt die einzige
  zählende Zuguhr.
- **`lib/MuehleGame.js`** ist die autoritative Zustandsmaschine: Sie prüft jede Aktion gegen die
  Regeln aus `shared/muehleRules.js`.

### Client

Der Client kommt ohne Framework und ohne Build-Schritt aus: `index.html` lädt genau ein ES-Modul,
den Controller `js/app.js`. Alles andere erreicht den Browser über dessen `import`-Anweisungen, auch
das geteilte Regelmodul und der Socket.io-Client (`/socket.io/socket.io.esm.min.js`). Ein Modul, das
nicht importiert wird, erreicht weder den Browser noch die Tests.

```
js/app.js  →  /socket.io/socket.io.esm.min.js · /shared/muehleRules.js
              audio · boardRenderer · hudView · dockView · overlays
```

Die Aufteilung folgt einer Regel: **Die Views zeichnen, der Controller spricht.** `hudView.js`,
`dockView.js`, `overlays.js` und `boardRenderer.js` bekommen fertige Daten und besitzen keinen
Socket; nur `app.js` sendet Aktionen an den Server und verteilt dessen Antworten. Deshalb ist auch
der Countdown in den Spielerkarten reine Anzeige: Er kann gar keinen Zug auslösen.

### CSS

Das Stylesheet besteht aus zwölf Modulen, je eines pro Abschnitt der Oberfläche.
`public/css/style.css` enthält keine eigenen Regeln, sondern ist das **Manifest**: Eine
`@layer`-Anweisung legt die Reihenfolge der **Cascade Layers** fest, und jedes Modul wird per
`@import … layer(<name>)` in seinen gleichnamigen Layer geladen. Die Seite bindet nur dieses eine
Stylesheet ein.

```
public/css/style.css   →   tokens · base · layout · controls · login
                           hud · arena · dock · board · modals · responsive · utilities
```

- **Layer-Reihenfolge**: `tokens` hat die niedrigste Priorität, `responsive` überschreibt mit seinen
  Breakpoints die Module davor, und `utilities` kommt zuletzt. Es enthält nur die Regel für das
  `hidden`-Attribut, die jede Komponente schlagen muss. Zwischen zwei Layern entscheidet die
  Reihenfolge vor der Spezifität, deshalb braucht keine Regel `!important` (das die Reihenfolge der
  Layer sogar umkehren würde).
- **Ein Modul gilt erst, wenn es im Manifest steht.** `tests/CssModules.test.js` prüft das, zusammen
  mit der Regel, dass Custom Properties nur in `tokens.css` stehen.
- **CSS Nesting**: Zustände, Pseudo-Elemente und Kindelemente einer Komponente stehen in deren
  Regelblock (`&.active-turn`, `&::before`, `.icon`). `responsive.css` bleibt bewusst flach, damit
  jeder Breakpoint als Liste von Überschreibungen lesbar ist; seine Media Queries sind Bereiche
  (`@media (width <= 700px)`).
- **Farben** stehen als `oklch(<Helligkeit> <Chroma> <Farbton>)`, Theme-abhängige als
  `light-dark(<hell>, <dunkel>)`. Eine abgeleitete Farbe sagt, woraus sie entsteht: Jeder Tint ist
  sein Akzent mit Transparenz gemischt (`color-mix(in srgb, var(--accent-blue) 10%, transparent)`),
  das Material des Headers ist die Fläche zu 72 %.
- **Logical Properties** für Abstände, Rahmen und Positionen (`margin-block-end`, `padding-inline`,
  `inset-block-start` …). Physisch bleiben nur die Abstände neben `env(safe-area-inset-left/right)`,
  weil diese Insets feste Bildschirmkanten sind, während `inline-start` der Schreibrichtung folgt.
- **Keine Container Queries**, bewusst: Die einzige Komponente in mehreren Layouts, die Spielerkarte,
  wird auf dem Smartphone kompakt, weil dort die Höhe fehlt, nicht wegen ihrer eigenen Breite. Auf
  dem Desktop ist sie mit 224 px schmaler als die kompakte Karte auf einem 700 px breiten Smartphone
  (334 px).

### Hilfsskripte

Werkzeuge, die Stylesheet oder Client als Ganzes lesen (Kontrast-Checker und statische Tests), gehen
über zwei Skripte. Sie lösen die Imports so auf wie der Browser, damit eine Zusicherung weiter gilt,
wenn Code in ein anderes Modul umzieht:

```bash
node scripts/css-bundle.js      # aufgelöstes Stylesheet, jedes Modul in seinem @layer-Block
node scripts/client-bundle.js   # aufgelöster Client-Modulgraph ab js/app.js
```

---

## 📁 Projektstruktur

```
MuehleJS/
├── server.js                 # Einstieg: Express, Socket.io-Events → GameManager, IPv6 & IPv4
├── lib/                      # Serverlogik
│   ├── MuehleGame.js         # Autoritative Zustandsmaschine (Phasen, legale Züge, Sieg)
│   ├── GameManager.js        # Matchmaking, parallele Spielräume & Zug-Timer (25 s)
│   ├── clientAddress.js      # Client-Adresse & Budget-Schlüssel fürs Rate Limiting (Proxy-Vertrauen, IPv6 pro /64)
│   └── RateLimiter.js        # In-Memory Sliding-Window Rate Limiter (DoS-Schutz)
├── shared/
│   └── muehleRules.js        # Geteiltes Regelmodul für Server UND Browser: Geometrie, Mühlen, Schlagen, Brett-Diff
├── public/                   # Alles, was der Browser lädt
│   ├── index.html            # Single-Page-App (Login, Matchmaking, Spielbrett, <dialog>-Dialoge)
│   ├── manifest.webmanifest  # Web App Manifest (Home-Bildschirm, Standalone-Modus)
│   ├── icon.svg              # App- und Favicon
│   ├── css/
│   │   ├── style.css         # Manifest: @layer-Reihenfolge und @import-Liste, keine eigenen Regeln
│   │   ├── tokens.css        # Design-Tokens: oklch()-Farben als light-dark()-Paare, abgeleitete per color-mix()
│   │   ├── base.css          # Reset, Typografie, Touch-Handling, Scrollbars, Icons
│   │   ├── layout.css        # App-Shell: Header (Verbindungsstatus, Ton) & Screen-Switcher
│   │   ├── controls.css      # Buttons & Eingabefelder
│   │   ├── login.css         # Login/Lobby und Matchmaking-Warteschlange
│   │   ├── hud.css           # Statuszeile (Phase und Anweisung) & Spielwerkzeuge
│   │   ├── arena.css         # Spielerkarten mit Zuguhr und die Brettfläche dazwischen
│   │   ├── dock.css          # Zugprotokoll & Chat (auf Smartphones mit Tab-Leiste)
│   │   ├── board.css         # SVG-Brett (Gradienten, Marker, Stein-Animationen)
│   │   ├── modals.css        # Native <dialog>-Elemente (::backdrop, Scroll-Sperre) & Toasts
│   │   ├── responsive.css    # Breakpoints, pointer/hover, prefers-reduced-motion
│   │   └── utilities.css     # Letzter Layer: das hidden-Attribut, ohne !important
│   └── js/
│       ├── app.js            # Controller: Socket.io-Client, Screen-Wechsel & Brett-Interaktion
│       ├── boardRenderer.js  # SVG-Spielfeld: Interaktion, Hervorhebungen & Stein-Animationen
│       ├── hudView.js        # Statuszeile, Spielerkarten und Zuguhr
│       ├── dockView.js       # Zugprotokoll, Chat und Tab-Leiste auf kleinen Bildschirmen
│       ├── overlays.js       # Dialog-Antworten (Aufgeben, Spielende), Toasts, Verbindungsanzeige
│       └── audio.js          # Web-Audio-Synthesizer (Setz-, Zug-, Schlag- & Fanfaren-Sounds)
├── scripts/
│   ├── contrast.js           # WCAG-2.1-Kontrastberechnung (Hex, rgb(), oklch(), color-mix())
│   ├── contrast-check.js     # CLI: prüft alle CSS-Farbpaare gegen WCAG 2.1 AA
│   ├── css-bundle.js         # Löst die @import-Kette von style.css samt Cascade Layers auf
│   └── client-bundle.js      # Löst den Modul-Import-Graphen ab index.html auf
├── tests/
│   ├── MuehleGame.test.js    # Alle Spielregeln und Randfälle
│   ├── GameRules.test.js     # Abgleich von geteiltem Regelmodul und Server-Engine
│   ├── GameManager.test.js   # Matchmaking, Verbindungsabbruch und Zug-Timer
│   ├── Integration.test.js   # End-to-End über WebSockets
│   ├── Security.test.js      # Rate Limiting und Eingabesäuberung
│   ├── Environment.test.js   # .env.example vollständig und auskommentiert, Port-Vorrang
│   ├── Responsive.test.js    # Smartphone-Layout, Touch-Ziele & iOS-Anpassungen
│   ├── BoardAnimation.test.js # Stein-Animationen und Mühlen-Strahl
│   ├── AudioMute.test.js     # Ton-Einstellung bei blockiertem localStorage
│   ├── ContrastCheck.test.js # WCAG-2.1-Kontrastberechnung
│   ├── CssModules.test.js    # CSS-Manifest: Vollständigkeit, Cascade Layers, light-dark()-Auflösung
│   ├── ClientModules.test.js # Client-Modulgraph: Vollständigkeit, Reihenfolge, Views ohne Socket
│   └── ModernStandards.test.js # Keine Rückwärtskompatibilität, aktuelle Standards
├── docs/
│   └── contrast-check.md     # Dokumentation der WCAG-2.1-AA-Kontrastprüfung
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   └── code-review.yml   # Issue-Vorlage für Funde aus dem Code Review (Stand: Tag code-review)
│   └── workflows/
│       └── node.js.yml       # CI (Node.js 22.x, 24.x, 26.x): npm ci, Build, Lint, Formatprüfung, Tests, Kontrast
├── LICENSE                   # MIT-Lizenz
├── README.md                 # Diese Dokumentation
├── Systemmodel.md            # Systemmodell: Architektur, Domänenmodell, Zustandsautomaten, Protokoll
├── CLAUDE.md                 # Vorgaben der Portfolioaufgabe & Projektregeln für Claude Code
├── package.json              # Projektkonfiguration, Abhängigkeiten & Skripte
├── package-lock.json         # Fixierte Abhängigkeitsversionen
├── .env.example              # Vorlage für .env: PORT, TRUST_PROXY, TURN_TIMEOUT_MS (alle optional)
├── .npmrc                    # engine-strict=true (erzwingt die Node-Version aus "engines")
├── eslint.config.js          # ESLint Flat Config (Globals je Laufzeit)
├── prettier.config.js        # Prettier-Stil des Projekts
├── .prettierignore           # Von Prettier ausgenommen: package-lock.json, HTML, Markdown
└── .gitignore                # node_modules, .DS_Store, coverage, .env
```

---

## 📄 Lizenz

Veröffentlicht unter der [MIT-Lizenz](LICENSE).
