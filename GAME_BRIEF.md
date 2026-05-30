# Mobile Tennis Arcade — MVP Brief

Ziel: Ein sofort spielbares, schnelles Mobile-Browser-Tennisspiel, das sich auf dem Handy gut anfühlt und Spass macht.

## Kernidee

**Neon Rally Tennis**: Portrait-first Arcade-Tennis. Der Spieler steuert unten einen Racket-/Tennis-Avatar per Touch/Drag. Ziel ist, Ballwechsel möglichst lange zu halten, Power-Ups zu sammeln und Combos zu erreichen.

## Warum diese Richtung

- Tennis passt zu Kilian und ist schnell verständlich.
- Mobile Browser braucht einfache Inputs: Drag links/rechts, Tap für Smash/Boost.
- Kurze Sessions funktionieren besser als komplexe Karriere-Systeme.
- Visuell kann es mit Neon, Partikeln, Screenshake und Score-Combos sofort hochwertig wirken.

## MVP Scope

- Vite + TypeScript oder Vanilla Canvas, keine schwere Engine nötig.
- Portrait-first responsive Layout.
- Canvas-Spiel mit:
  - Player-Racket unten, Gegner/KI oben.
  - Ballphysik mit Bounce, Spin, Geschwindigkeit.
  - Touch/Mouse Drag-Steuerung.
  - Tap/Swipe-Timing für Smash oder Power Shot.
  - Score, Rally-Counter, Combo-Multiplikator.
  - 3 Power-Ups: Slow-Mo, Big Racket, Fire Ball.
  - Start/Game-over/Restart Screens.
  - Soundeffekte optional via WebAudio ohne externe Dateien.
- Fancy Look:
  - dunkler Neon-Court
  - Glow-Linien
  - Partikel beim Ballkontakt
  - kleines Juicy Feedback: Screenshake, Hit sparks, score popups

## Acceptance Criteria

- `npm install`, `npm run dev`, `npm run build` funktionieren.
- Spiel läuft im Mobile-Viewport 390x844 sauber.
- Maus und Touch funktionieren.
- Keine externen API Keys.
- Public deploybar als statische Site auf GitHub Pages/Vercel.
- README mit Startanleitung.

## Nice-to-have, falls Zeit

- Schwierigkeit steigt nach Rally-Länge.
- LocalStorage Highscore.
- PWA manifest.
- 2–3 visuelle Racket-/Ball-Skins.
