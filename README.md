# Faktencheck lokal

Chrome-Erweiterung für macOS und Windows: Text auf einer Webseite markieren → Rechtsklick → **Faktencheck**. Die Prüfung läuft mit der in Chrome eingebauten KI (Gemini Nano, Prompt API) direkt auf dem Gerät – ohne Cloud, ohne Konto, ohne API-Schlüssel.

Webseite: <https://fmatsch.ist/faktencheck/>

## So funktioniert es

1. Das Kontextmenü übergibt den markierten Text an die Seitenleiste.
2. Das lokale Modell zieht bis zu fünf überprüfbare Tatsachenbehauptungen heraus.
3. Jede Behauptung wird einzeln bewertet: *Stimmt · Stimmt im Kern · Irreführend · Überwiegend falsch · Falsch · Nicht prüfbar* – mit kurzer Begründung und Angabe, wie sicher sich das Modell ist.
4. Zu jeder Behauptung gibt es Links zum Selbst-Nachprüfen (Websuche, Faktenchecks anderer).

Optional (in den Einstellungen, standardmäßig aus): **Wikipedia als Beleg**. Dann werden die Suchbegriffe zu jeder Behauptung an wikipedia.org gesendet und die Artikelanfänge dem Modell als Beleg mitgegeben. Der markierte Text selbst verlässt das Gerät nie.

## Voraussetzungen

- Google Chrome ab Version 138 auf dem Computer; Deutsch als Antwortsprache ab Version 149 (davor antwortet das Modell auf Englisch).
- Windows 10/11 oder macOS 13+.
- Mindestens 22 GB freier Speicher auf dem Laufwerk des Chrome-Profils (einmaliger Modell-Download).
- Grafikchip mit mehr als 4 GB Speicher **oder** 16 GB RAM und 4 Prozessorkerne.

Welche Hardware rechnet, entscheidet Chrome: derzeit Grafikchip oder Prozessor. Eine NPU wird von Chrome für Gemini Nano bisher nicht eigens angesteuert; die Erweiterung nutzt automatisch, was Chrome bereitstellt. Den Zustand des Modells zeigt `chrome://on-device-internals`.

## Installation

1. ZIP aus den [Releases](../../releases/latest) laden und entpacken.
2. `chrome://extensions` öffnen, oben rechts **Entwicklermodus** einschalten.
3. **Entpackte Erweiterung laden** → den entpackten Ordner auswählen.
4. Beim ersten Faktencheck einmal auf **Lokales KI-Modell laden** klicken.

## Grenzen

Gemini Nano ist ein kleines Sprachmodell. Es kann sich irren, kennt keine aktuellen Ereignisse und hat ohne die Wikipedia-Option keinerlei Zugriff auf Quellen. Das Ergebnis ist eine erste Einschätzung, kein Urteil – wichtige Aussagen immer an den Quellen gegenprüfen.

## Entwicklung

Kein Build-Schritt. Der Ordner `extension/` ist die Erweiterung (Manifest V3):

- `background.js` – Kontextmenü, öffnet die Seitenleiste
- `panel.html`, `panel.css`, `panel.js` – Oberfläche und Prüfablauf
- Berechtigungen: `contextMenus`, `sidePanel`, `storage` – keine Zugriffsrechte auf Webseiten

Die Webseite liegt in `docs/` (GitHub Pages).

## Lizenz

MIT
