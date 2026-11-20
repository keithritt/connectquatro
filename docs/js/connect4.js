/*
 * Connect4 game engine - JavaScript port of web/classes/connect4.py
 *
 * Spots are named like the original: column letter + row number,
 * e.g. "a1" is the bottom-left spot and "g6" is the top-right spot.
 * History is a list of spots in the order they were played.
 */
(function (root) {
  'use strict';

  var COLS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  var ROWS = 6;
  // the four directions a line of 4 can run in (col step, row step)
  var DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

  // all 69 possible lines of four (24 horizontal, 21 vertical, 24 diagonal)
  var LINES = [];
  (function () {
    for (var c = 0; c < COLS.length; c++) {
      for (var r = 1; r <= ROWS; r++) {
        for (var d = 0; d < DIRECTIONS.length; d++) {
          var ec = c + DIRECTIONS[d][0] * 3, er = r + DIRECTIONS[d][1] * 3;
          if (ec < 0 || ec >= COLS.length || er < 1 || er > ROWS) continue;
          var line = [];
          for (var i = 0; i < 4; i++) line.push(COLS[c + DIRECTIONS[d][0] * i] + (r + DIRECTIONS[d][1] * i));
          LINES.push(line);
        }
      }
    }
  })();

  // All "sevens": a horizontal bar of four plus a diagonal of four going down from one end of the bar.
  // They share one spot - the corner - so the 7 spots look like the number 7 (or its mirror image).
  // Each entry: { corner: 'g4', spots: [corner, 3 bar spots, 3 diagonal spots] }
  var SEVENS = [];
  (function () {
    for (var r = 4; r <= ROWS; r++) {
      for (var c = 0; c < COLS.length; c++) {
        for (var dir = -1; dir <= 1; dir += 2) {   // -1: bar runs left, diagonal down-left (a 7); +1: mirror image
          if (c + dir * 3 < 0 || c + dir * 3 >= COLS.length) continue;
          var spots = [COLS[c] + r];
          for (var i = 1; i <= 3; i++) spots.push(COLS[c + dir * i] + r);          // bar
          for (i = 1; i <= 3; i++) spots.push(COLS[c + dir * i] + (r - i));        // diagonal
          SEVENS.push({ corner: COLS[c] + r, spots: spots });
        }
      }
    }
  })();

  function Connect4(options) {
    options = options || {};
    this.firstMove = options.firstMove === 'yellow' ? 'yellow' : 'red';
    this.reset();
    var history = options.history || [];
    for (var i = 0; i < history.length; i++) {
      this.dropChecker(history[i][0]);
    }
  }

  Connect4.COLS = COLS;
  Connect4.ROWS = ROWS;
  Connect4.LINES = LINES;
  Connect4.SEVENS = SEVENS;

  Connect4.prototype.reset = function () {
    this.history = [];
    this.grid = {};          // spot -> 'red' | 'yellow'
    this.heights = {};       // col -> number of checkers in it
    for (var i = 0; i < COLS.length; i++) this.heights[COLS[i]] = 0;
    this.currentTurn = this.firstMove;
    this.winner = null;      // 'red' | 'yellow' | null
    this.winningSeq = null;  // array of spots, or null
    this.gameOver = false;
    this.status = 'active';  // 'active' | 'win' | 'tie'
  };

  Connect4.prototype.isColAvailable = function (col) {
    return !this.gameOver && this.heights[col] !== undefined && this.heights[col] < ROWS;
  };

  Connect4.prototype.availableCols = function () {
    var self = this;
    return COLS.filter(function (c) { return self.isColAvailable(c); });
  };

  // Drop the current player's checker into a column.
  // Returns the spot it lands on, or null if the move isn't allowed.
  Connect4.prototype.dropChecker = function (col) {
    if (!this.isColAvailable(col)) return null;
    this.heights[col] += 1;
    var spot = col + this.heights[col];
    var color = this.currentTurn;
    this.grid[spot] = color;
    this.history.push(spot);

    var seq = this.findLine(spot, color);
    if (seq) {
      this.gameOver = true;
      this.status = 'win';
      this.winner = color;
      this.winningSeq = seq;
    } else if (this.history.length === COLS.length * ROWS) {
      this.gameOver = true;
      this.status = 'tie';
    } else {
      this.toggleTurn();
    }
    return spot;
  };

  // Take back the last move.
  Connect4.prototype.undo = function () {
    var spot = this.history.pop();
    if (!spot) return null;
    delete this.grid[spot];
    this.heights[spot[0]] -= 1;
    if (!this.gameOver) this.toggleTurn();
    this.gameOver = false;
    this.status = 'active';
    this.winner = null;
    this.winningSeq = null;
    return spot;
  };

  Connect4.prototype.toggleTurn = function () {
    this.currentTurn = this.currentTurn === 'red' ? 'yellow' : 'red';
  };

  Connect4.prototype.lastSpot = function () {
    return this.history.length ? this.history[this.history.length - 1] : null;
  };

  Connect4.prototype.colorAt = function (colIdx, row) {
    if (colIdx < 0 || colIdx >= COLS.length || row < 1 || row > ROWS) return null;
    return this.grid[COLS[colIdx] + row] || null;
  };

  // If the checker at `spot` completes 4 (or more) in a row for `color`,
  // return every spot in that line; otherwise null.
  Connect4.prototype.findLine = function (spot, color) {
    var c = COLS.indexOf(spot[0]);
    var r = parseInt(spot.slice(1), 10);
    for (var d = 0; d < DIRECTIONS.length; d++) {
      var dc = DIRECTIONS[d][0], dr = DIRECTIONS[d][1];
      var line = [spot];
      var i;
      for (i = 1; this.colorAt(c + dc * i, r + dr * i) === color; i++) line.push(COLS[c + dc * i] + (r + dr * i));
      for (i = 1; this.colorAt(c - dc * i, r - dr * i) === color; i++) line.unshift(COLS[c - dc * i] + (r - dr * i));
      if (line.length >= 4) return line;
    }
    return null;
  };

  // Would dropping `color` into `col` win the game?
  Connect4.prototype.wouldWin = function (col, color) {
    if (!this.isColAvailable(col)) return false;
    var spot = col + (this.heights[col] + 1);
    this.grid[spot] = color;
    var win = this.findLine(spot, color) !== null;
    delete this.grid[spot];
    return win;
  };

  // Pick a move for the computer and explain why.
  //  skill 1 (easy):   random column - same as the original Python version
  //  skill 2 (medium): win if it can, block if it must, avoid handing over a win, favour the centre
  // Returns { col, reason, text } where reason is one of:
  //  'win' | 'block' | 'center' | 'near-center' | 'random' | 'forced'
  Connect4.prototype.pickMove = function (skill, rand) {
    rand = rand || Math.random;
    var cols = this.availableCols();
    if (!cols.length) return null;
    var pickRandom = function (list) { return list[Math.floor(rand() * list.length)]; };
    if (skill !== 2) {
      return { col: pickRandom(cols), reason: 'random', text: 'Random move (Easy level picks any open column).' };
    }

    var me = this.currentTurn;
    var them = me === 'red' ? 'yellow' : 'red';
    var self = this;
    var i;

    for (i = 0; i < cols.length; i++) {
      if (this.wouldWin(cols[i], me)) return { col: cols[i], reason: 'win', text: 'Moving here for victory.' };
    }
    for (i = 0; i < cols.length; i++) {
      if (this.wouldWin(cols[i], them)) return { col: cols[i], reason: 'block', text: 'Moving here to block your Connect Four.' };
    }

    // don't play directly under a spot the opponent could win on
    var skipped = [];
    var safe = cols.filter(function (col) {
      if (self.heights[col] + 2 > ROWS) return true;
      var below = col + (self.heights[col] + 1);
      self.grid[below] = me;
      self.heights[col] += 1;
      var givesWin = self.wouldWin(col, them);
      self.heights[col] -= 1;
      delete self.grid[below];
      if (givesWin) skipped.push(col + (self.heights[col] + 2));
      return !givesWin;
    });
    if (!safe.length) {
      var forced = pickRandom(cols);
      return { col: forced, reason: 'forced', text: 'Every column sets you up to win, so this is the least bad choice (picked at random).' };
    }

    // weight columns toward the centre
    var weights = { a: 1, b: 2, c: 3, d: 4, e: 3, f: 2, g: 1 };
    var total = 0;
    safe.forEach(function (c) { total += weights[c]; });
    var roll = rand() * total;
    var pick = safe[safe.length - 1];
    for (i = 0; i < safe.length; i++) {
      roll -= weights[safe[i]];
      if (roll < 0) { pick = safe[i]; break; }
    }

    var reason, text;
    if (pick === 'd') { reason = 'center'; text = 'Taking the center column.'; }
    else if (pick === 'c' || pick === 'e') { reason = 'near-center'; text = 'Staying near the center.'; }
    else { reason = 'random'; text = 'No special reason, so this is a random pick.'; }
    if (skipped.length) {
      text += ' (Avoided ' + skipped.join(', ') + ': filling the spot below would let you win there.)';
    }
    return { col: pick, reason: reason, text: text };
  };

  Connect4.prototype.pickCol = function (skill, rand) {
    var move = this.pickMove(skill, rand);
    return move ? move.col : null;
  };

  // Numbers for studying the position.
  //  movesLeft:  empty spots left on the board (and how many each colour still gets to play)
  //  open:       lines of four that contain none of the opponent's checkers - still possible to win
  //  byCount[n]: of those open lines, how many already hold n of that colour's checkers (n = 0..3)
  //  sevens:     open sevens (see SEVENS); sevensClose: of those, how many already hold 2+ of that colour's checkers
  Connect4.prototype.stats = function () {
    var played = { red: 0, yellow: 0 };
    for (var s in this.grid) played[this.grid[s]]++;
    var half = COLS.length * ROWS / 2;
    var out = {
      movesLeft: COLS.length * ROWS - this.history.length,
      totalLines: LINES.length,
      totalSevens: SEVENS.length,
      red: { movesLeft: half - played.red, open: 0, byCount: [0, 0, 0, 0], sevens: 0, sevensClose: 0 },
      yellow: { movesLeft: half - played.yellow, open: 0, byCount: [0, 0, 0, 0], sevens: 0, sevensClose: 0 }
    };
    var i, j;
    for (i = 0; i < LINES.length; i++) {
      var n = { red: 0, yellow: 0 };
      for (j = 0; j < 4; j++) {
        var color = this.grid[LINES[i][j]];
        if (color) n[color]++;
      }
      if (n.yellow === 0) { out.red.open++; out.red.byCount[n.red]++; }
      if (n.red === 0) { out.yellow.open++; out.yellow.byCount[n.yellow]++; }
    }
    // sevens: still possible for a colour if the corner is empty and the opponent has no checker in any of the 7 spots
    for (i = 0; i < SEVENS.length; i++) {
      var seven = SEVENS[i];
      if (this.grid[seven.corner]) continue;
      var m = { red: 0, yellow: 0 };
      for (j = 0; j < 7; j++) {
        var col = this.grid[seven.spots[j]];
        if (col) m[col]++;
      }
      ['red', 'yellow'].forEach(function (c) {
        var other = c === 'red' ? 'yellow' : 'red';
        if (m[other] === 0) {
          out[c].sevens++;
          if (m[c] >= 2) out[c].sevensClose++;
        }
      });
    }
    return out;
  };

  // History string in the original format: first mover's initial, then spots, e.g. "R-d1-d2-e1"
  Connect4.prototype.getHistory = function () {
    if (!this.history.length) return '';
    return [this.firstMove === 'red' ? 'R' : 'Y'].concat(this.history).join('-');
  };

  Connect4.fromHistory = function (str) {
    if (!str) return new Connect4();
    var parts = String(str).split('-');
    var first = parts.shift() === 'Y' ? 'yellow' : 'red';
    return new Connect4({ firstMove: first, history: parts });
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Connect4;
  else root.Connect4 = Connect4;
})(this);
