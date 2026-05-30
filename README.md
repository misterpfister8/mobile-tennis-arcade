# Neon Rally Tennis

A mobile-first browser tennis arcade MVP built with Vite, TypeScript, and Canvas. Drag the lower racket to keep the rally alive, tap near impact for a smash, and collect neon powerups for higher scores.

## Features

- Portrait-first responsive Canvas game tuned for `390x844`.
- Touch, pen, and mouse controls via pointer events.
- Player racket, AI opponent, ball bounce, spin, speed scaling, and rally difficulty ramp.
- Score, rally counter, combo multiplier, restart flow, and `localStorage` high score.
- Three powerups: Slow-Mo, Big Racket, and Fire Ball.
- Neon court, glow lines, particles, score popups, screen shake, and WebAudio effects.
- Static deploy target with a small PWA manifest.

## Run Locally

```bash
npm install
npm run dev
```

Open the local Vite URL in a browser. Use mobile device emulation or a phone-sized viewport for the intended layout.

## Build

```bash
npm run build
```

The production output is written to `dist/` and can be hosted as a static site.
