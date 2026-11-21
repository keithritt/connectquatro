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
  var reasons = [];   // reasons[i] explains game.history[i]; null for the human's moves
  var busy = false;      // true while the computer is "thinking"
  var cpuTimer = null;
  var counted = false;   // has the current game's result been added to the score?

  // ---------- storage (optional - the page works without it) ----------
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        score: score,
        history: game.getHistory(),
        reasons: reasons,
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
    renderLog();
    syncLink();
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

  function renderLog() {
    var logEl = $('log');
    if (!game.history.length) {
      logEl.innerHTML = '<li class="text-body-secondary">No moves yet.</li>';
      $('why-text').textContent = 'It will explain each of its moves here.';
      return;
    }
    var html = '';
    var lastCpu = null;
    game.history.forEach(function (spot, i) {
      var color = game.grid[spot];
      var why = reasons[i] || '';
      if (why) lastCpu = why;
      html += '<li' + (i === game.history.length - 1 ? ' class="latest"' : '') + '><span class="n">' + (i + 1) + '.</span>' +
        '<span class="dot ' + color + '"></span><span class="spot">' + spot + '</span>' +
        '<span class="why">' + (color === HUMAN ? 'You' : escapeHtml(why || 'Computer')) + '</span></li>';
    });
    logEl.innerHTML = html;
    $('why-text').textContent = lastCpu || 'It will explain each of its moves here.';
  }

  // ---------- shareable position link ----------
  // The position lives in the URL hash as a plain code, e.g. #R-d1-d2-e1
  function syncLink() {
    var hash = '#' + game.code();
    if (location.hash !== hash) {
      try { location.replace(hash); } catch (e) { /* some frames block it - the field below still works */ }
    }
    $('link').value = location.href.replace(/#.*$/, '') + hash;
  }

  function loadFromText(text) {
    var g = Connect4.parse(text);
    var msg = $('load-msg');
    if (!g) {
      msg.className = 'small mt-1 text-danger';
      msg.textContent = "That isn't a legal position. Use a code like R-d1-d2-e1 (first mover R or Y, then each spot in order).";
      return false;
    }
    msg.className = 'small mt-1 text-success';
    msg.textContent = 'Loaded.';
    $('first-' + (g.firstMove === CPU ? 'cpu' : 'you')).checked = true;
    newGame(g.code());
    return true;
  }

  function escapeHtml(t) {
    return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
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
  function play(col, reason) {
    var spot = game.dropChecker(col);
    if (!spot) return;
    reasons.length = game.history.length - 1;
    reasons.push(reason || null);
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
      var move = game.pickMove(parseInt(skillEl.value, 10));
      play(move.col, move.text);
    }, CPU_DELAY);
  }

  function finish() {
    counted = true;
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
    game = (historyStr && Connect4.parse(historyStr)) || new Connect4({ firstMove: firstChoice() });
    counted = false;
    reasons = [];
    if (historyStr && historyStr === saved.history && Array.isArray(saved.reasons) && saved.reasons.length === game.history.length) reasons = saved.reasons.slice();
    else while (reasons.length < game.history.length) reasons.push(null);
    render();
    save();
    if (!game.gameOver && game.currentTurn === CPU) cpuTurn();
  }

  function undo() {
    if (busy) return;
    var wasOver = game.gameOver;
    var status = game.status, winner = game.winner;
    counted = false;
    // take back moves up to and including the human's last move
    var popped;
    do {
      popped = game.grid[game.lastSpot()];
      game.undo();
    } while (popped !== HUMAN && game.history.length);
    reasons.length = game.history.length;
    if (wasOver && counted) { // un-count the finished game
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

  $('copy-link').addEventListener('click', function () {
    var input = $('link');
    input.select();
    var done = function () { $('copy-link').textContent = 'Copied'; setTimeout(function () { $('copy-link').textContent = 'Copy link'; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(done, function () { /* selected - press copy */ });
    }
  });
  $('load-btn').addEventListener('click', function () { if (loadFromText($('load').value)) $('load').value = ''; });
  $('load').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('load-btn').click(); });
  // the viewer edited the address bar (or followed another link): jump to that position
  window.addEventListener('hashchange', function () {
    var code = location.hash.slice(1);
    if (code && code !== game.code() && Connect4.parse(code)) loadFromText(code);
  });

  // ---------- start ----------
  if (saved.skill) skillEl.value = saved.skill;
  if (saved.first === CPU) $('first-cpu').checked = true;
  buildBoard();
  var fromLink = location.hash.length > 1 && Connect4.parse(location.hash.slice(1));
  if (fromLink) loadFromText(location.hash.slice(1));
  else newGame(saved.history && !Connect4.fromHistory(saved.history).gameOver ? saved.history : null);
})();
