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
  var ANALYZE_MS = 3500;   // time limit for rating a move / analyzing a position
  var PERFECT_MS = 4000;   // time limit for one move on the Perfect level
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
  var score = saved.score || { w: 0, l: 0, t: 0 };          // you vs the computer
  var score2 = saved.score2 || { r: 0, y: 0, t: 0 };        // pass and play
  var mode = saved.mode === 'two' ? 'two' : 'cpu';            // 'cpu' = play the computer, 'two' = two people
  var game;
  var reasons = [];   // reasons[i] explains game.history[i]; null for the human's moves
  var thinkId = 0;       // identifies the search whose answer we still want
  var worker = null;     // Web Worker running the Perfect solver
  var analysisWorker = null;   // a second one for move ratings, so rating never delays the computer
  var analysisId = 0;
  var autoRate = saved.rate !== false;
  var ratings = [];      // ratings[i]: short verdict for the move game.history[i], if it was rated
  var mainSolver = null; // used only if workers aren't available
  var busy = false;      // true while the computer is "thinking"
  var cpuTimer = null;
  var counted = false;   // which score ('cpu' or 'two') this game's result was added to, or false

  // ---------- storage (optional - the page works without it) ----------
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        score: score,
        score2: score2,
        mode: mode,
        rate: autoRate,
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

  function twoPlayer() { return mode === 'two'; }
  function humanTurn() { return twoPlayer() || game.currentTurn === HUMAN; }   // does a person move next?
  function isCpuTurn() { return !twoPlayer() && game.currentTurn === CPU; }

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

    var canPlay = !game.gameOver && !busy && humanTurn();
    dropRowEl.querySelectorAll('.drop-btn').forEach(function (b) {
      b.disabled = !canPlay || !game.isColAvailable(b.dataset.col);
      if (b.disabled) b.classList.remove('preview', 'red', 'yellow');
    });
    undoBtn.disabled = busy || (twoPlayer() ? !game.history.length : !game.history.some(function (s) { return game.grid[s] === HUMAN; }));

    renderStatus();
    renderStats();
    renderLog();
    syncLink();
    scoreEl.textContent = twoPlayer()
      ? 'Red ' + score2.r + ' · Yellow ' + score2.y + ' · Tie ' + score2.t
      : score.w + ' W · ' + score.l + ' L · ' + score.t + ' T';
    renderMode();
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
        '<span class="why">' + (twoPlayer() ? cap(color) : color === HUMAN ? 'You' : escapeHtml(why || 'Computer')) +
        (ratings[i] ? ' <span class="badge text-bg-light border">' + escapeHtml(ratings[i]) + '</span>' : '') + '</span></li>';
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

  // labels and panels that depend on who you're playing
  function renderMode() {
    var two = twoPlayer();
    $('why').classList.toggle('d-none', two);
    $('skill-col').classList.toggle('d-none', two);
    document.querySelector('label[for="first-you"]').textContent = two ? 'Red' : 'You';
    document.querySelector('label[for="first-cpu"]').textContent = two ? 'Yellow' : 'Computer';
    $('help').textContent = two
      ? 'Pass and play: take turns on the same screen. Red is shown as the first checker color. Who goes first applies to the next game.'
      : "You're red. Tap a column to drop a checker. Who goes first and the computer level apply to the next game.";
    $('mode').value = mode;
  }

  function renderStatus() {
    var html;
    if (game.status === 'win') {
      html = '<span class="dot ' + game.winner + '"></span>' +
        (twoPlayer() ? cap(game.winner) + ' wins!' : game.winner === HUMAN ? 'You win!' : 'Computer wins');
    } else if (game.status === 'tie') {
      html = 'Tie game.';
    } else if (twoPlayer()) {
      html = '<span class="dot ' + game.currentTurn + '"></span>' + cap(game.currentTurn) + "'s turn";
    } else if (game.currentTurn === HUMAN && !busy) {
      html = '<span class="dot red"></span>Your turn';
    } else {
      html = '<span class="dot yellow"></span>Computer is thinking' + (skillEl.value === '3' ? ' (perfect play, up to ' + PERFECT_MS / 1000 + ' s)' : '') + '…';
    }
    statusEl.innerHTML = html;

    var lastSpot = game.lastSpot();
    lastMoveEl.textContent = lastSpot ? 'Last move: ' + cap(game.grid[lastSpot]) + ' to ' + lastSpot : '';
  }

  // ---------- game flow ----------
  function play(col, reason) {
    var preMoves = historyCols(game.history), mover = game.currentTurn;
    var spot = game.dropChecker(col);
    if (!spot) return;
    if (!reason && autoRate) rateMove(preMoves, COLS.indexOf(col), game.history.length - 1, twoPlayer() ? cap(mover) : 'You');
    reasons.length = game.history.length - 1;
    reasons.push(reason || null);
    render(spot);
    save();
    if (game.gameOver) {
      finish();
    } else if (isCpuTurn()) {
      cpuTurn();
    }
  }

  function cpuTurn() {
    busy = true;
    render();
    var skill = parseInt(skillEl.value, 10);
    if (skill === 3) {
      thinkPerfect(function (res) {
        busy = false;
        play(COLS[res.col], describePerfect(res));
      });
      return;
    }
    cpuTimer = setTimeout(function () {
      cpuTimer = null;
      busy = false;
      var move = game.pickMove(skill);
      play(move.col, move.text);
    }, CPU_DELAY);
  }

  // ---------- the Perfect level: solver.js runs in a Web Worker so the page stays responsive ----------
  function makeWorker() {
    try {
      var src = 'var createC4Solver = ' + createC4Solver.toString() + ';\n' +
        'var solver = createC4Solver();\n' +
        'onmessage = function (e) { var d = e.data;\n' +
        '  postMessage({ id: d.id, result: d.type === "analyze" ? solver.analyze(d.moves, d.ms) : solver.think(d.moves, d.ms) }); };';
      return new Worker(URL.createObjectURL(new Blob([src], { type: 'application/javascript' })));
    } catch (e) { return null; }
  }
  function getWorker() { return worker || (worker = makeWorker()); }

  function thinkPerfect(done) {
    var id = ++thinkId;
    var moves = game.history.map(function (spot) { return COLS.indexOf(spot[0]); });
    function onMain() {   // fallback: shorter search on the page itself
      setTimeout(function () {
        if (id !== thinkId) return;
        mainSolver = mainSolver || createC4Solver();
        done(mainSolver.think(moves, 1500));
      }, 30);
    }
    var w = getWorker();
    if (!w) return onMain();
    w.onmessage = function (e) { if (e.data.id === id) done(e.data.result); };
    w.onerror = function () { if (worker) { worker.terminate(); worker = null; } onMain(); };
    w.postMessage({ id: id, type: 'think', moves: moves, ms: PERFECT_MS });
  }

  function cancelThinking() {
    thinkId++;                                   // ignore any answer still on its way
    if (worker) { worker.terminate(); worker = null; }
    if (cpuTimer) { clearTimeout(cpuTimer); cpuTimer = null; }
  }

  // ---------- move analysis: every option rated against exact play ----------
  function historyCols(h) { return h.map(function (spot) { return COLS.indexOf(spot[0]); }); }

  function runAnalysis(moves, done) {
    var id = ++analysisId;
    function onMain() {
      setTimeout(function () {
        if (id !== analysisId) return;
        mainSolver = mainSolver || createC4Solver();
        done(mainSolver.analyze(moves, 1200));
      }, 30);
    }
    if (!analysisWorker) analysisWorker = makeWorker();
    var w = analysisWorker;
    if (!w) return onMain();
    w.onmessage = function (e) { if (e.data.id === id) done(e.data.result); };
    w.onerror = function () { if (analysisWorker) { analysisWorker.terminate(); analysisWorker = null; } onMain(); };
    w.postMessage({ id: id, type: 'analyze', moves: moves, ms: ANALYZE_MS });
  }

  function cancelAnalysis() {
    analysisId++;
    if (analysisWorker) { analysisWorker.terminate(); analysisWorker = null; }
  }

  function resetAnalysisPanel() {
    $('rate-verdict').textContent = "Make a move and I'll rate it against perfect play, or analyze the position.";
    $('rate-table').innerHTML = '';
  }

  // "Win in 3" / "Loss in 2" / "Draw" / "≈ +12"
  function resultText(e) {
    if (e.outcome === 'win') return e.theory ? 'Win (known result)' : 'Win in ' + (e.plies + 1) / 2;
    if (e.outcome === 'loss') return e.theory ? 'Loss (known result)' : 'Loss in ' + e.plies / 2;
    if (e.outcome === 'draw') return 'Draw';
    return '≈ ' + (e.score > 0 ? '+' : '') + e.score;
  }
  function rank(e) { return e.outcome === 'win' ? 2 : e.outcome === 'draw' ? 1 : e.outcome === 'loss' ? 0 : -1; }

  // Compare the move that was played with the best available. Returns { label, text, kind }.
  function rateChoice(a, col, who) {
    var mine = a.cols.filter(function (e) { return e.col === col; })[0];
    var bestScore = Math.max.apply(null, a.cols.map(function (e) { return e.score; }));
    var bests = a.cols.filter(function (e) { return e.score === bestScore; });
    var best = bests[0];
    var bestNames = bests.map(function (e) { return COLS[e.col]; }).join(' or ');
    var played = COLS[col];
    var r;
    if (!mine) return null;
    if (mine.score === bestScore) {
      var sure = mine.proven;
      r = { label: sure ? 'Best move' : 'Best found', kind: 'good',
        text: who + ' played ' + played + ': ' + (sure ? 'the best move' : 'the best move I could find') +
          ' (' + resultText(mine) + ').' + (bests.length > 1 ? ' Equally good: ' + bests.filter(function (e) { return e !== mine; }).map(function (e) { return COLS[e.col]; }).join(', ') + '.' : '') };
    } else if (mine.proven && best.proven) {
      var rm = rank(mine), rb = rank(best);
      if (rm === rb && rm === 2) r = { label: 'Slower win', kind: 'ok', text: who + ' played ' + played + ': still a forced win (' + resultText(mine) + '), but ' + bestNames + ' was faster (' + resultText(best) + ').' };
      else if (rm === rb && rm === 0) r = { label: 'Loses sooner', kind: 'bad', text: who + ' played ' + played + ': the position was already lost, and this loses sooner (' + resultText(mine) + '). ' + bestNames + ' held out longer (' + resultText(best) + ').' };
      else if (rb === 2 && rm === 1) r = { label: 'Mistake', kind: 'bad', text: who + ' played ' + played + ': that lets a win slip to a draw. ' + bestNames + ' won (' + resultText(best) + ').' };
      else r = { label: 'Blunder', kind: 'bad', text: who + ' played ' + played + ': that loses by force (' + resultText(mine) + '). ' + bestNames + ' was ' + resultText(best).toLowerCase() + '.' };
    } else if (mine.proven && mine.outcome === 'loss') {
      r = { label: 'Blunder', kind: 'bad', text: who + ' played ' + played + ': that loses by force (' + resultText(mine) + '). ' + bestNames + ' was better.' };
    } else if (best.proven && best.outcome === 'win') {
      r = { label: 'Missed win', kind: 'bad', text: bestNames + ' wins by force (' + resultText(best) + '). ' + who + ' played ' + played + ', which I couldn\'t prove is winning.' };
    } else {
      var diff = bestScore - mine.score;
      r = diff <= 8 ? { label: 'Close (est.)', kind: 'ok', text: who + ' played ' + played + ': close to the best I found, ' + bestNames + ' (estimate).' }
        : diff <= 30 ? { label: 'Inaccuracy? (est.)', kind: 'warn', text: who + ' played ' + played + ': ' + bestNames + ' looks better (estimate: too open to solve).' }
        : { label: 'Weaker (est.)', kind: 'warn', text: who + ' played ' + played + ': ' + bestNames + ' looks clearly better (estimate: too open to solve).' };
    }
    return r;
  }

  function renderAnalysisTable(a, playedCol) {
    var bestScore = Math.max.apply(null, a.cols.map(function (e) { return e.score; }));
    var rows = a.cols.map(function (e) {
      var tags = [];
      if (e.score === bestScore) tags.push('best');
      if (e.col === playedCol) tags.push('played');
      var cls = e.score === bestScore ? ' class="table-success"' : e.outcome === 'loss' && e.proven ? ' class="table-danger"' : '';
      return '<tr' + cls + '><th scope="row" class="fw-semibold">' + COLS[e.col] + '</th><td>' + resultText(e) +
        '</td><td class="text-end text-body-secondary">' + tags.join(' · ') + '</td></tr>';
    }).join('');
    var depth = a.theory ? '' : '<caption class="small caption-top pb-1">' + (a.depth >= a.empties - 1 ? 'Solved to the end of the game.' : 'Looked ' + a.depth + ' moves ahead in ' + (a.ms / 1000).toFixed(1) + ' s.') + '</caption>';
    $('rate-table').innerHTML = '<table class="table table-sm mb-0 align-middle">' + depth + '<tbody>' + rows + '</tbody></table>';
  }

  // rate a move that was just played; `preMoves` is the position before it
  function rateMove(preMoves, col, index, who) {
    $('rate-verdict').textContent = 'Rating ' + COLS[col] + '…';
    $('rate-table').innerHTML = '';
    runAnalysis(preMoves, function (a) {
      var r = rateChoice(a, col, who);
      if (!r) return;
      ratings[index] = r.label;
      $('rate-verdict').innerHTML = '<span class="badge text-bg-' + (r.kind === 'good' ? 'success' : r.kind === 'ok' ? 'secondary' : r.kind === 'warn' ? 'warning' : 'danger') + ' me-2">' + r.label + '</span>' + r.text;
      renderAnalysisTable(a, col);
      renderLog();
    });
  }

  function analyzeCurrent() {
    if (game.gameOver) return;
    $('rate-verdict').textContent = 'Analyzing…';
    $('rate-table').innerHTML = '';
    runAnalysis(historyCols(game.history), function (a) {
      var bests = a.cols.filter(function (e) { return e.score === Math.max.apply(null, a.cols.map(function (x) { return x.score; })); });
      var b = bests[0];
      $('rate-verdict').textContent = cap(game.currentTurn) + ' to move. Best: ' + bests.map(function (e) { return COLS[e.col]; }).join(' or ') +
        ' (' + resultText(b) + (b.proven ? '' : ', estimate') + ').';
      renderAnalysisTable(a, -1);
    });
  }

  // say what the solver proved (or didn't)
  function describePerfect(res) {
    if (res.theory) return 'Perfect play: the center column is the known winning first move.';
    if (res.outcome === 'win') {
      var k = (res.plies + 1) / 2;   // how many of the computer's moves, counting this one
      return k === 1 ? 'Moving here for victory.'
        : 'Perfect play: forced win in ' + k + ' moves (this one included), however you answer.';
    }
    if (res.outcome === 'loss') {
      var j = res.plies / 2;         // your replies until you win
      return 'Perfect play: this position is lost against best play. This move holds out longest; you can win in ' +
        j + (j === 1 ? ' move.' : ' moves.');
    }
    if (res.outcome === 'draw') return 'Perfect play: the best anyone can get from here is a draw.';
    return 'Best guess, not proven: searched ' + res.depth + ' moves ahead in ' + (res.ms / 1000).toFixed(1) +
      ' s. Too many moves are left to solve the game in the time limit.';
  }

  function finish() {
    counted = mode;
    if (twoPlayer()) {
      if (game.status === 'win') score2[game.winner === 'red' ? 'r' : 'y']++;
      else score2.t++;
    } else if (game.status === 'win' && game.winner === HUMAN) score.w++;
    else if (game.status === 'win') score.l++;
    else score.t++;
    save();
    render();

    var title, body;
    if (game.status === 'tie') { title = 'Tie game'; body = 'The board is full - nobody connected four.'; }
    else if (twoPlayer()) { title = cap(game.winner) + ' wins!'; body = 'Four in a row: ' + game.winningSeq.join(', ') + '.'; }
    else if (game.winner === HUMAN) { title = 'You win!'; body = 'Four in a row: ' + game.winningSeq.join(', ') + '.'; }
    else { title = 'Computer wins'; body = 'It connected ' + game.winningSeq.join(', ') + '.'; }
    $('result-title').textContent = title;
    $('result-body').textContent = body;
    if (resultModal) setTimeout(function () { resultModal.show(); }, 900);
  }

  function newGame(historyStr) {
    cancelThinking();
    cancelAnalysis(); resetAnalysisPanel();
    ratings = [];
    busy = false;
    game = (historyStr && Connect4.parse(historyStr)) || new Connect4({ firstMove: firstChoice() });
    counted = false;
    reasons = [];
    if (historyStr && historyStr === saved.history && Array.isArray(saved.reasons) && saved.reasons.length === game.history.length) reasons = saved.reasons.slice();
    else while (reasons.length < game.history.length) reasons.push(null);
    render();
    save();
    if (!game.gameOver && isCpuTurn()) cpuTurn();
  }

  function undo() {
    if (busy) return;
    var wasCounted = counted;      // which score (if any) this finished game was added to
    var status = game.status, winner = game.winner;
    counted = false;
    if (twoPlayer()) {
      game.undo();                 // pass and play: take back just the last move
    } else {
      // against the computer: take back moves up to and including your last move
      var popped;
      do {
        popped = game.grid[game.lastSpot()];
        game.undo();
      } while (popped !== HUMAN && game.history.length);
    }
    reasons.length = game.history.length;
    ratings.length = game.history.length;
    cancelAnalysis(); resetAnalysisPanel();
    if (wasCounted === 'two') {    // un-count the finished game
      if (status === 'tie') score2.t = Math.max(0, score2.t - 1);
      else score2[winner === 'red' ? 'r' : 'y'] = Math.max(0, score2[winner === 'red' ? 'r' : 'y'] - 1);
    } else if (wasCounted === 'cpu') {
      if (status === 'tie') score.t = Math.max(0, score.t - 1);
      else if (winner === HUMAN) score.w = Math.max(0, score.w - 1);
      else score.l = Math.max(0, score.l - 1);
    }
    render();
    save();
    if (isCpuTurn()) cpuTurn();
  }

  // ---------- events ----------
  function colFromEvent(e) {
    var el = e.target.closest('[data-col]');
    return el ? el.dataset.col : null;
  }
  function tryPlay(col) {
    if (!col || busy || game.gameOver || !humanTurn()) return;
    play(col);
  }
  dropRowEl.addEventListener('click', function (e) { tryPlay(colFromEvent(e)); });
  boardEl.addEventListener('click', function (e) { tryPlay(colFromEvent(e)); });

  function preview(col) {
    dropRowEl.querySelectorAll('.drop-btn').forEach(function (b) {
      var on = b.dataset.col === col && !b.disabled;
      b.classList.toggle('preview', on);
      b.classList.toggle('red', on && game.currentTurn === 'red');
      b.classList.toggle('yellow', on && game.currentTurn === 'yellow');
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
  // switching opponent keeps the current position and just changes who controls yellow
  $('mode').addEventListener('change', function () {
    mode = $('mode').value === 'two' ? 'two' : 'cpu';
    cancelThinking();
    busy = false;
    render();
    save();
    if (!game.gameOver && isCpuTurn()) cpuTurn();
  });
  document.querySelectorAll('input[name="first"]').forEach(function (r) { r.addEventListener('change', save); });

  $('analyze-btn').addEventListener('click', analyzeCurrent);
  $('rate-auto').checked = autoRate;
  $('rate-auto').addEventListener('change', function () { autoRate = $('rate-auto').checked; save(); });
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
  $('mode').value = mode;
  if (saved.first === CPU) $('first-cpu').checked = true;
  buildBoard();
  var fromLink = location.hash.length > 1 && Connect4.parse(location.hash.slice(1));
  if (fromLink) loadFromText(location.hash.slice(1));
  else newGame(saved.history && !Connect4.fromHistory(saved.history).gameOver ? saved.history : null);
})();
