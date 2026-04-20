# HTML → PDF (Designed)

Wandelt HTML in **hochwertig gestaltete** PDFs um — Lebensläufe, Whitepaper, Zeitungsartikel, Einladungen, Zertifikate.
Kommt in **zwei Geschmacksrichtungen**:

- **Web-UI** (für Vercel deploybar) — HTML reinpasten, Button drücken, PDF herunterladen. Ideal für Kursteilnehmer.
- **CLI** (lokal) — Datei rein, PDF raus, skriptbar.

Beides nutzt **Puppeteer** (Chromium), damit CSS-Grid, Flexbox, Google Fonts, Webfonts, Icons und Custom-Properties 1:1 rendern.

## Kosten

- **Vercel Free/Hobby:** 0 €. 100 GB-Stunden Funktionen/Monat → ~100.000+ PDFs. Für einen Kurs vollkommen ausreichend.
- **GitHub:** 0 € für public repos.
- **Alles andere (Puppeteer, Chromium, Fonts):** open source, 0 €.

## Projektstruktur

```
.
├── api/convert.js          # Vercel Serverless-Funktion (puppeteer-core + @sparticuz/chromium)
├── public/
│   ├── index.html          # Web-UI (was Kursteilnehmer sehen)
│   └── sample.html         # „Beispiel laden"-CV
├── src/
│   ├── cli.js              # lokale CLI
│   └── converter.js        # Puppeteer-Wrapper (lokal, bundled Chromium)
├── examples/               # Beispiel-HTML (Whitepaper, Zertifikat)
├── vercel.json             # Funktions-Konfiguration (60 s Timeout, 1 GB RAM)
└── package.json
```

## Deployment auf Vercel (mit GitHub)

1. Code auf GitHub pushen:
   ```bash
   git init
   git add .
   git commit -m "initial"
   git branch -M main
   git remote add origin https://github.com/DEIN-USER/html-to-pdf.git
   git push -u origin main
   ```
2. Auf [vercel.com](https://vercel.com) einloggen → **Add New Project** → GitHub-Repo auswählen → **Deploy**.
   Keine Environment-Variablen nötig. Build läuft automatisch durch.
3. Du bekommst eine URL wie `dein-projekt.vercel.app` — genau die Adresse an Kursteilnehmer schicken.

Bei jedem Git-Push zu `main` deployed Vercel automatisch neu.

## Lokale Entwicklung

### Web-UI lokal testen

```bash
npm install
npm install -g vercel  # einmalig
npm run dev            # startet http://localhost:3000
```

### CLI

```bash
npm install
npm run cli:whitepaper
npm run cli:certificate
# oder direkt:
node src/cli.js -i examples/whitepaper.html -o out/whitepaper.pdf
```

## Wie die Umwandlung funktioniert

Du wirfst **beliebiges HTML** rein — Puppeteer (ein headless Chrome) rendert es exakt wie ein normaler Browser und druckt es als PDF. Alles was im HTML/CSS steht — Farben, Fonts, Bilder, Layout, Animationen (als Standbild), Hervorhebungen — landet 1:1 im PDF.

**Voraussetzungen ans HTML:**
- Google Fonts per `<link>` einbinden (läuft über deren CDN)
- Bilder als URL oder Data-URL (lokale Dateipfade funktionieren online **nicht**)
- Icons per Icon-Font CDN (z. B. Lucide, FontAwesome)
- Für volle Seitenkontrolle: `@page { size: A4; margin: 0; }` + `.page { page-break-after: always }`

## Was nicht geht (bewusst)

- **Kein Speichern/Accounts** — Das Tool ist zustandslos. Kursteilnehmer laden sich das PDF direkt herunter. Keine Datenbank nötig, keine DSGVO-Sorgen.
- **Kein Upload von lokalen Bildern** (würde Server-Storage brauchen). Workaround: Bild-URLs verwenden oder als Base64-Data-URL einbetten.

## Missbrauchsschutz (Empfehlung)

Auf Vercel Hobby ist das unlimitiert. Falls du Sorge hast, dass jemand dein Kontingent missbraucht:

- Vercel → Projekt-Settings → **Deployment Protection** → Password Protection aktivieren, Passwort nur an Kursteilnehmer geben.
- Oder Rate-Limiting in `api/convert.js` hinzufügen (z. B. per IP, via `@upstash/ratelimit`).

## Eigene Design-Vorlagen

Jede HTML-Datei, die `@page { size: ... }` + `.page` nutzt, funktioniert direkt. Farben/Fonts anpassen über CSS-Variablen:

```css
:root {
  --paper:  #FAF8F3;
  --ink:    #11162A;
  --accent: #E8552B;
}
```

## Lizenz

MIT
