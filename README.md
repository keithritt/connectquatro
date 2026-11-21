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
- **Pass and play:** set *Opponent* to "Another person" and two people take turns on the same screen
  (red and yellow, with their own score). You can switch opponent mid-game; the position is kept.
- Two computer levels: **Easy** (random moves, like the original) and **Medium** (takes a win,
  blocks yours, sets up forks, avoids setting you up, otherwise the middle column, or a random one if that is unavailable).
- A **Game stats** panel for studying play: moves remaining, and for each color how many of the 69
  possible four-in-a-row lines are still open (with 1, 2 or 3 of that color's checkers already in them),
  plus how many "sevens" are still open (a row of four plus a diagonal of four from one end, sharing an
  empty corner, so filling the corner makes a double threat).
- The computer explains every move (victory, blocking your Connect Four, "Forcing win: straight line fork"
  when it makes an open three you can't fully block, staying near the center,
  avoiding a setup, or random), shown under the board and in a running **Move log**.
- **Shareable positions:** the URL hash always holds the current board (e.g. `#R-d1-e1-d2`: first
  mover, then every spot in order). Copy the link from the *Share this position* card to send or
  bookmark an exact scenario; opening it sets up that board with the same player to move. You can also
  paste a link or code into *Load a position*.
- Undo, a running score, and the game in progress are saved in the browser.

## Django version

The original Django app (`manage.py`, `web/`, `connectquatro/`) is still here for reference.
