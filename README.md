# connectquatro

Connect 4 against the computer.

## JavaScript version (`docs/`)

The game now runs entirely in the browser — no server needed. It's a static site built with
[Bootstrap 5](https://getbootstrap.com/) (loaded from cdnjs).

- `docs/index.html` – the page
- `docs/js/connect4.js` – game engine (port of `web/classes/connect4.py`)
- `docs/js/app.js` – board UI, computer turns, undo, score
- `docs/css/style.css` – board styles
- `docs/img/` – checker images

To play locally, open `docs/index.html` in a browser. To host it, turn on GitHub Pages for the
`docs/` folder (Settings → Pages → Branch: `master`, folder: `/docs`).

Run the engine tests with Node:

```
node docs/test/connect4.test.js
```

### Changes from the Python version

- Wins are detected in all four directions (the Python version only checked vertical lines).
- Tie detection works when the board fills up.
- Either player can go first.
- Two computer levels: **Easy** (random moves, like the original) and **Medium** (takes a win,
  blocks yours, avoids setting you up, prefers the centre).
- Undo, a running score, and the game in progress are saved in the browser.

## Django version

The original Django app (`manage.py`, `web/`, `connectquatro/`) is still here for reference.
