# CLAUDE.md

Mühle (Nine Men's Morris) als verteiltes Zwei-Personen-Spiel: die Portfolioaufgabe im
Modul **W3WI_110.2 Web-Entwicklung** (DHBW). Funktionen, Regeln und Betrieb beschreibt
[README.md](README.md), Architektur, Zustandsautomaten und das Socket.io-Protokoll
[Systemmodel.md](Systemmodel.md). Diese Datei sammelt nur die verbindlichen Vorgaben und
Projektregeln.

## Befehle

```bash
npm install                          # bricht auf zu alter Node-Version ab (engine-strict)
npm run build                        # kein Bundler nötig, schließt sofort ab
npm start                            # Port 3000; eigener Port: npm start 8080 oder PORT=8080 npm start
                                     # lädt .env, falls vorhanden (Vorlage: .env.example)
npm test                             # Jest im ESM-Modus, alle Tests
npm test -- tests/MuehleGame.test.js # eine einzelne Testdatei
npm run lint                         # ESLint (eslint.config.js)
npm run format                       # Prettier formatiert alle Dateien (prettier.config.js)
npm run format:check                 # Prettier prüft nur, wie in der CI
npm run contrast-check               # WCAG-2.1-AA-Kontrast aller Farbpaare
node scripts/css-bundle.js           # aufgelöstes Stylesheet (alle @import-Module)
node scripts/client-bundle.js        # aufgelöster Client-Modulgraph ab js/app.js
```

Für die Browser-Vorschau gibt es lokal die Konfiguration `start` in `.claude/launch.json`
(Port 3000, nicht eingecheckt).

## Vorgaben der Portfolioaufgabe (verbindlich)

- **Technik**: HTML, CSS und JavaScript, keine großen Frameworks. Erlaubt sind Express und
  Socket.io auf dem Server sowie Test-Frameworks wie Jest. Alles Weitere nur nach Absprache
  mit dem Dozenten, also **keine neue Abhängigkeit ohne Rückfrage bei Sven**.
- **Spielablauf**:
  1. Ein Spieler meldet sich über die Login-Seite beim Server an.
  2. Sobald sich ein zweiter Spieler anmeldet, werden beide automatisch gepaart und das Spiel startet.
  3. Die Spieler ziehen abwechselnd: Der Client schickt seinen Zug an den Server, der ihn an den Gegner weitergibt.
  4. Hat ein Spieler gewonnen, sehen das beide, und das Spiel endet.
  5. Danach können sich die Spieler erneut anmelden.
- **Browser**: lauffähig in der jeweils aktuellen Version von Firefox, Safari und Chrome.
- **Auflösung**: spielbar ab 1024 × 768 Pixeln (Desktop).
- **Fehler**: Bei einem Fehler (z. B. Verbindungsabbruch) wird das Spiel einfach beendet.
  Der Server darf nie abstürzen.
- **Betrieb**: Die Serveranwendung läuft auf dem bereitgestellten Server, und alle
  spielen gleichzeitig, also viele parallele Partien.
- **Build**: Auf einem Ubuntu-Rechner mit Node.js muss das Projekt direkt nach dem Checkout
  mit `npm install`, `npm run build` und `npm start <port>` laufen und vollständig spielbar
  sein, auch auf einem reinen IPv4-Rechner.
- **Abgabe**: als GitHub-Projekt. Die finale Abgabe entsteht per `git clone --depth 1`,
  es zählt also nur, was committet ist.
- **KI**: erlaubt, solange das Spiel die Anforderungen erfüllt und Sven alles eigenständig
  präsentieren kann. Code deshalb lesbar halten und jede Änderung erklären.

## Bewertungskriterien für den Code

Die Qualität des finalen Codes und „Läuft das Spiel“ bringen je 15 Punkte. Die Aufgabe
nennt als Schwerpunkte für das Code Review:

- **Build-Prozess**: Lässt sich das Projekt direkt nach dem Checkout bauen?
- **HTML + CSS**:
  - Ist das CSS modularisiert und verständlich, und wird modernes CSS genutzt?
  - Ist das HTML modern und semantisch?
  - Wie sind Layout und Animation umgesetzt?
- **JavaScript (Client und Server)**:
  - Ist die Kommunikation zwischen Client und Server angemessen?
  - Ist der Server robust gegen Fehler und Cheating?
  - Ist der Code verständlich und nicht unnötig komplex?
- **Architektur und Kommunikationsablauf**: als Mermaid-Diagramme in `Systemmodel.md`.

Die Kriterien für die Bewertung des Codes verlinkt die Aufgabe auf die Folien
[Code Reviews](https://delors.github.io/lab-codereviews/folien.de.md.html). Kurzfassung:

- **Voraussetzungen**: Code einheitlich formatiert, gelintet, frei von Syntaxfehlern und
  getestet. Architektur und zentrale Entscheidungen sind dokumentiert.
- **Build und Projektstruktur**:
  - Die README erklärt Bauen und Starten, das Aufsetzen braucht nur wenige Schritte.
  - Abhängigkeiten sind über `package-lock.json` fixiert, Entwicklungs- und
    Laufzeitabhängigkeiten sind getrennt.
  - Linter und Formatter sind konfiguriert und per Skript aufrufbar (z. B. `npm run lint`).
  - Umgebungsvariablen sind sauber verwaltet (z. B. `.env` mit `.env.example`).
  - Die Ordnerstruktur spiegelt die Architektur, generierte Dateien gehören nicht ins Repository.
- **CSS**:
  - Sprechende, einheitliche Namen für Custom Properties, Klassen und IDs, in einer Sprache.
  - Keine Redundanz, einfache Selektoren, kein `!important`. Komplizierte Selektoren sind kommentiert.
  - CSS Nesting und `@layer`, ein klares Vorgehen (Mobile- oder Desktop-first),
    einheitliche Einheiten und Farbwerte.
  - Modernes CSS: Custom Properties, Container Queries für wiederverwendete Komponenten,
    `:has()` statt JavaScript-Umwegen, Logical Properties (`margin-inline`, `padding-block` …),
    `color-mix()` und `oklch()`.
- **HTML**:
  - Einfache Struktur ohne tief verschachtelte `div`s, semantische Elemente, eine
    saubere Überschriftenhierarchie, Viewport- und weitere Meta-Tags.
  - Keine Inline-Styles, kein Inline-JavaScript, kein `<br>` fürs Layout.
  - Barrierefreiheit: `alt`-Texte, Formularfelder mit `<label>`, komplett per Tastatur
    bedienbar, Kontrast nach WCAG AA, ARIA nur, wo semantisches HTML nicht reicht.
  - Verständliche, einheitliche IDs. Eingaben werden im Client über HTML-Attribute
    (`required`, `pattern`, `type`) geprüft und zusätzlich auf dem Server.
- **JavaScript**:
  - Bezeichner sagen, was der Code tut. Sonderfälle und `null`/`undefined` sind behandelt.
  - Die Fehlerbehandlung ist einheitlich: kein verschluckter Fehler, aussagekräftiges
    Logging, jedes Promise abgesichert.
  - Kontroll- und Datenfluss sind nachvollziehbar, die Architektur wird eingehalten.
    Kleine, fokussierte Funktionen, keine tiefe Verschachtelung.
  - DOM-Änderungen auf das Nötige beschränkt, Event-Listener wieder entfernt (keine Memory Leaks).
  - `const`/`let`, Destrukturierung, Spread/Rest, Klassen und ES-Module, `async`/`await`.
  - Jede Abhängigkeit ist begründet und aktuell. Die Tests reichen aus, Kommentare stimmen,
    TODOs und FIXMEs sind umsetzbar.
  - Die Logik ist zwischen Client und Server sinnvoll verteilt, auch mit Blick auf Cheating.

## Termine

| Datum | Was |
|---|---|
| 7.10. | Einführung in Code Reviews, Zwischenstand (5 Min., Spiel muss lokal vorführbar sein), Code Review eines anderen Projekts |
| 14.10. | Abgabe der GitHub-Issues aus diesem Code Review, Präsentation der Ergebnisse (10 Min.) |
| 27.10., 8:00 | Abgabe der finalen Lösung |
| 28.10. | Spieltag: Das Spiel muss vollständig spielbar sein |

## Projektregel: nur die neuesten Standards

Es gibt keine Rückwärtskompatibilität:

- keine Vendor-Präfixe, Fallback-Paare (z. B. `vh` vor `dvh`) oder Vendor-Metatags,
- keine Feature-Erkennung für Funktionen, die alle Zielbrowser ausliefern,
- nur ES-Module (kein CommonJS, keine globalen Skripte), Node-Built-ins über `node:`.

Das gilt auch dann, wenn ein Kommentar den Fallback begründet. Statt älterer Idiome kommt
der aktuelle Standard zum Einsatz:

- `<dialog>` mit Invoker Commands (`command`/`commandfor`) statt `confirm()`,
- das `hidden`-Attribut statt einer `.hidden`-Klasse,
- `light-dark()`-Tokens, Cascade Layers, CSS Nesting,
- Vorrang über die Layer-Reihenfolge statt `!important`, keine Inline-Styles,
- Media Queries als Bereiche (`width <= 700px`),
- Farben als `oklch()`; eine aus einem anderen Token abgeleitete Farbe als `var()` oder
  `color-mix()` dieses Tokens (mit `transparent` in `srgb` gemischt),
- Logical Properties (`margin-block-end`, `padding-inline` …); physisch bleiben nur die
  Abstände neben `env(safe-area-inset-left/right)`,
- private `#`-Felder und `#`-Methoden.

`tests/ModernStandards.test.js` wacht darüber. Die Grenze setzt die Aufgabe: Das Spiel muss
im aktuellen Firefox, Safari und Chrome spielbar bleiben, also darf nichts Spielentscheidendes
an einer Funktion hängen, die einem dieser Browser fehlt.

Bewusst behalten, weil sie keine Rückwärtskompatibilität sind:

- der IPv4-Listener in `server.js` (IPv4 ist Pflicht),
- die `setTimeout`-Fallbacks in `public/js/boardRenderer.js` (verstecktes Brett, reduzierte Bewegung),
- das `try/catch` um `localStorage` in `public/js/audio.js` (blockierter Speicher wirft auch in aktuellen Browsern).

## Projektregel: nur die neueste Version jeder Software

- **Node.js**: immer die neueste Hauptversion, nicht die LTS-Linie (derzeit 26). Bei einer
  neuen Hauptversion `engines` in `package.json`, die Schnellanleitung in der README und die
  CI-Matrix gemeinsam anheben.
- **npm**: die neueste Version (derzeit 11).
- **Abhängigkeiten und devDependencies**: jeweils die neueste Version. Keine ältere
  Hauptversion pinnen, nichts per `overrides` zurückhalten.
- **GitHub Actions**: die neueste Hauptversion jeder Action (z. B. `actions/checkout@v7`).
- **Browser**: nur die jeweils aktuelle Version von Firefox, Safari und Chrome.

Die aktuelle Version vor jeder Änderung nachschlagen (`npm outdated`,
`npm view <paket> version`, `gh api repos/<owner>/<repo>/releases/latest`), nicht aus dem
Gedächtnis übernehmen. Dependabot-PRs zeitnah mergen.

## Architekturregeln

Jede dieser Regeln ist durch Tests abgesichert.

- **Der Server ist autoritativ**: `lib/MuehleGame.js` prüft jede Aktion, dem Client wird nie
  vertraut. Die Zuguhr läuft nur im `lib/GameManager.js`; der Countdown im Browser ist reine
  Anzeige.
- **Ein Regelmodul**: `shared/muehleRules.js` ist das einzige Regelmodul für Server und
  Browser (`tests/GameRules.test.js`).
- **Schlanker Einstieg**: `server.js` liefert aus, übersetzt Socket-Events in
  `GameManager`-Aufrufe und bindet das Netzwerk. Spiellogik gehört nach `lib/`.
- **Client**: `public/index.html` lädt nur `js/app.js`. Nur `app.js` spricht mit dem Socket,
  die Views zeichnen nur (`tests/ClientModules.test.js`).
- **CSS**:
  - `public/css/style.css` ist das Manifest: `@layer`-Reihenfolge und `@import`-Liste,
    ein neues Modul gilt erst, wenn es dort steht. `responsive` kommt nach allen
    Komponenten, `utilities` (nur `[hidden]`) als letzter Layer.
  - Custom Properties stehen nur in `tokens.css`, und `responsive.css` bleibt flach
    (`tests/CssModules.test.js`).
  - Neue Farbpaare mit `npm run contrast-check` prüfen.

## Konventionen

- **Sprache**:
  - Deutsch: UI-Texte, Fehlermeldungen an Clients, `README.md` und `Systemmodel.md`.
  - Englisch: Code, Kommentare und Commit-Messages.
- **Commits**: Conventional Commits (`feat:`, `fix:`, `refactor:`, `style:`, `test:`,
  `build:`, `ci:`, `docs:`).
- **Formatierung**: Prettier formatiert, ESLint prüft. Vor jedem Commit `npm run format`
  und `npm run lint`.
- **Branches und PRs**: Gearbeitet wird auf einem Branch, der per Pull Request nach `main`
  geht. Die CI (`.github/workflows/node.js.yml`: `npm ci`, Build, Lint, Formatprüfung, Tests,
  Kontrastprüfung) muss grün sein.
- **Dokumentation**: Ändern sich Protokoll, Architektur oder Funktionen, werden
  `README.md` (inklusive Testanzahl und Projektstruktur) und die Mermaid-Diagramme in
  `Systemmodel.md` mitgezogen.
- **CSS-Refactorings**: die berechneten Stile aller Elemente im Browser vorher und nachher
  vergleichen.
