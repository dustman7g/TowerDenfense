# Canvas Tower Defense

A minimal, fully client-side tower defense game built with HTML5 Canvas and vanilla JavaScript.

## Play
- Open `td-game/index.html` in your browser.
- Click a tower button in the left sidebar.
- Click on the map to place the tower (can't place on the path or occupied cells).
- Click "Start Wave" to spawn enemies.

## Towers
- Basic (50 gold): Short range, decent damage.
- Sniper (70 gold): Long range, high damage, slower rate of fire.
- Splash (90 gold): Area damage around impact.

## Tips
- Earn gold by defeating enemies and clearing waves.
- Enemies that reach the end reduce your lives. Game over at 0 lives.

## Files
- `index.html` — UI shell and Canvas element.
- `styles.css` — Styling for UI and canvas frame.
- `src/game.js` — Game loop, entities, waves, rendering, and interactions.

## No build required
Just open `index.html`. Optionally serve locally for best results:

- Python: `python -m http.server 8000` and visit http://localhost:8000/td-game/
- Node (http-server): `npx http-server -p 8000` and visit http://localhost:8000/td-game/
