/*
 * Connect Quatro UI - replaces the Django views + AJAX calls with in-browser play.
 * The human is always red; the computer is yellow.
 */
(function () {
  'use strict';

  var COLS = Connect4.COLS;
  var ROWS = Connect4.ROWS;
  var HUMAN = 'red';
  var CPU = 'yellow';
  var CPU_DELAY = 550;
  var STORE_KEY = 'connectquatro';

  // short alias for document.getElementById (local to this file, so it won't clash with jQuery)
  function $(id) { return document.getElementById(id); }

  var boardEl = $('board');
  var dropRowEl = $('drop-row');
  var statusEl = $('status');
  var lastMoveEl = $('last-move');
  var scoreEl = $('score');
  var undoBtn = $('undo');
  var skillEl = $('skill');
  var resultModalEl = $('result-modal');
  var resultModal = window.bootstrap ? new bootstrap.Modal(resultModalEl) : null;

  var saved = load();
  var score = saved.score || { w: 0, l: 0, t: 0 };
  var game;
  var busy = false;      // true while the computer is "thinking"
  var cpuTimer = null;

  // ---------- storage (optional - the page works without it) ----------
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        score: score,
        history: game.getHistory(),
        skill: skillEl.value,
        first: firstChoice()
      }));
    } catch (e) { /* storage unavailable */ }
  }

  function firstChoice() {
    return document.querySelector('input[name="first"]:checked').value;
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---------- build the board ----------
  function buildBoard() {
    var drops = '';
    COLS.forEach(function (col) {
      drops += '<button type="button" class="drop-btn" data-col="' + col + '" aria-label="Drop in column ' + col.toUpperCase() + '"></button>';
    });
    dropRowEl.innerHTML = drops;

    var slots = '';
    for (var row = ROWS; row >= 1; row--) {
      COLS.forEach(function (col) {
        slots += '<div class="slot" id="spot-' + col + row + '" data-col="' + col + '"><div class="disc"></div></div>';
      });
    }
    boardEl.innerHTML = slots;
  }

  function discAt(spot) {
    return document.querySelector('#spot-' + spot + ' .disc');
  }

  // ---------- rendering ----------
  function render(animateSpot) {
    var last = {}; // most recent spot per colour gets the highlight, like the original
    for (var i = game.history.length - 1; i >= 0; i--) {
      var c = game.grid[game.history[i]];
      if (!last[c]) last[c] = game.history[i];
    }
    var winSpots = game.winningSeq || [];

    COLS.forEach(function (col) {
      for (var row = 1; row <= ROWS; row++) {
        var spot = col + row;
        var disc = discAt(spot);
        var color = game.grid[spot];
        var cls = 'disc';
        if (color) {
          cls += ' ' + color;
          if (winSpots.indexOf(spot) !== -1) cls += ' highlight win';
          else if (!game.gameOver && last[color] === spot) cls += ' highlight';
        }
        if (spot === animateSpot) {
          cls += ' falling';
          disc.style.setProperty('--fall', ROWS - row + 1);
          disc.style.setProperty('--dur', (180 + (ROWS - row) * 55) + 'ms');
        }
        disc.className = cls;
      }
      var full = game.heights[col] >= ROWS;
      document.querySelectorAll('.slot[data-col="' + col + '"]').forEach(function (s) {
        s.classList.toggle('full-col', full);
      });
    });

    var canPlay = !game.gameOver && !busy && game.currentTurn === HUMAN;
    dropRowEl.querySelectorAll('.drop-btn').forEach(function (b) {
      b.disabled = !canPlay || !game.isColAvailable(b.dataset.col);
      if (b.disabled) b.classList.remove('preview', 'red', 'yellow');
    });
    undoBtn.disabled = busy || !game.history.some(function (s) { return game.grid[s] === HUMAN; });

    renderStatus();
    renderStats();
    scoreEl.textContent = score.w + ' W · ' + score.l + ' L · ' + score.t + ' T';
  }

  function renderStats() {
    var st = game.stats();
    $('st-left').textContent = st.movesLeft;
    ['red', 'yellow'].forEach(function (c) {
      $('st-' + c + '-left').textContent = st[c].movesLeft;
      $('st-' + c + '-open').textContent = st[c].open;
      $('st-' + c + '-sevens').textContent = st[c].sevens;
      $('st-' + c + '-sevens-close').textContent = st[c].sevensClose;
      for (var n = 1; n <= 3; n++) $('st-' + c + '-c' + n).textContent = st[c].byCount[n];
    });
  }

  function renderStatus() {
    var html;
    if (game.status === 'win') {
      html = '<span class="dot ' + game.winner + '"></span>' + (game.winner === HUMAN ? 'You win!' : 'Computer wins');
    } else if (game.status === 'tie') {
      html = 'Tie game.';
    } else if (game.currentTurn === HUMAN && !busy) {
      html = '<span class="dot red"></span>Your turn';
    } else {
      html = '<span class="dot yellow"></span>Computer is thinking…';
    }
    statusEl.innerHTML = html;

    var lastSpot = game.lastSpot();
    lastMoveEl.textContent = lastSpot ? 'Last move: ' + cap(game.grid[lastSpot]) + ' to ' + lastSpot : '';
  }

  // ---------- game flow ----------
  function play(col) {
    var spot = game.dropChecker(col);
    if (!spot) return;
    render(spot);
    save();
    if (game.gameOver) {
      finish();
    } else if (game.currentTurn === CPU) {
      cpuTurn();
    }
  }

  function cpuTurn() {
    busy = true;
    render();
    cpuTimer = setTimeout(function () {
      cpuTimer = null;
      busy = false;
      play(game.pickCol(parseInt(skillEl.value, 10)));
    }, CPU_DELAY);
  }

  function finish() {
    if (game.status === 'win' && game.winner === HUMAN) score.w++;
    else if (game.status === 'win') score.l++;
    else score.t++;
    save();
    render();

    var title, body;
    if (game.status === 'tie') { title = 'Tie game'; body = 'The board is full - nobody connected four.'; }
    else if (game.winner === HUMAN) { title = 'You win!'; body = 'Four in a row: ' + game.winningSeq.join(', ') + '.'; }
    else { title = 'Computer wins'; body = 'It connected ' + game.winningSeq.join(', ') + '.'; }
    $('result-title').textContent = title;
    $('result-body').textContent = body;
    if (resultModal) setTimeout(function () { resultModal.show(); }, 900);
  }

  function newGame(historyStr) {
    if (cpuTimer) { clearTimeout(cpuTimer); cpuTimer = null; }
    busy = false;
    game = historyStr ? Connect4.fromHistory(historyStr) : new Connect4({ firstMove: firstChoice() });
    render();
    save();
    if (!game.gameOver && game.currentTurn === CPU) cpuTurn();
  }

  function undo() {
    if (busy) return;
    var wasOver = game.gameOver;
    var status = game.status, winner = game.winner;
    // take back moves up to and including the human's last move
    var popped;
    do {
      popped = game.grid[game.lastSpot()];
      game.undo();
    } while (popped !== HUMAN && game.history.length);
    if (wasOver) { // un-count the finished game
      if (status === 'tie') score.t = Math.max(0, score.t - 1);
      else if (winner === HUMAN) score.w = Math.max(0, score.w - 1);
      else score.l = Math.max(0, score.l - 1);
    }
    render();
    save();
    if (game.currentTurn === CPU) cpuTurn();
  }

  // ---------- events ----------
  function colFromEvent(e) {
    var el = e.target.closest('[data-col]');
    return el ? el.dataset.col : null;
  }
  function tryPlay(col) {
    if (!col || busy || game.gameOver || game.currentTurn !== HUMAN) return;
    play(col);
  }
  dropRowEl.addEventListener('click', function (e) { tryPlay(colFromEvent(e)); });
  boardEl.addEventListener('click', function (e) { tryPlay(colFromEvent(e)); });

  function preview(col) {
    dropRowEl.querySelectorAll('.drop-btn').forEach(function (b) {
      var on = b.dataset.col === col && !b.disabled;
      b.classList.toggle('preview', on);
      b.classList.toggle(HUMAN, on);
    });
  }
  [boardEl, dropRowEl].forEach(function (el) {
    el.addEventListener('mouseover', function (e) { preview(colFromEvent(e)); });
    el.addEventListener('mouseleave', function () { preview(null); });
  });
  dropRowEl.addEventListener('focusin', function (e) {
    if (e.target.matches(':focus-visible')) preview(colFromEvent(e)); // keyboard only, not taps
  });
  dropRowEl.addEventListener('focusout', function () { preview(null); });

  document.addEventListener('keydown', function (e) {
    if (e.target.closest('select, input')) return;
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= 7) tryPlay(COLS[n - 1]);
  });

  $('new-game').addEventListener('click', function () { newGame(); });
  $('play-again').addEventListener('click', function () {
    if (resultModal) resultModal.hide();
    newGame();
  });
  undoBtn.addEventListener('click', undo);
  skillEl.addEventListener('change', save);
  document.querySelectorAll('input[name="first"]').forEach(function (r) { r.addEventListener('change', save); });

  // ---------- start ----------
  if (saved.skill) skillEl.value = saved.skill;
  if (saved.first === CPU) $('first-cpu').checked = true;
  buildBoard();
  newGame(saved.history && !Connect4.fromHistory(saved.history).gameOver ? saved.history : null);
})();
