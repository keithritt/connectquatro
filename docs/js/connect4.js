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

  // Pick a column for the computer.
  //  skill 1 (easy):   random column - same as the original Python version
  //  skill 2 (medium): win if it can, block if it must, avoid handing over a win, favour the centre
  Connect4.prototype.pickCol = function (skill, rand) {
    rand = rand || Math.random;
    var cols = this.availableCols();
    if (!cols.length) return null;
    var pickRandom = function (list) { return list[Math.floor(rand() * list.length)]; };
    if (skill !== 2) return pickRandom(cols);

    var me = this.currentTurn;
    var them = me === 'red' ? 'yellow' : 'red';
    var self = this;
    var i;

    for (i = 0; i < cols.length; i++) if (this.wouldWin(cols[i], me)) return cols[i];
    for (i = 0; i < cols.length; i++) if (this.wouldWin(cols[i], them)) return cols[i];

    // don't play directly under a spot the opponent could win on
    var safe = cols.filter(function (col) {
      if (self.heights[col] + 2 > ROWS) return true;
      var below = col + (self.heights[col] + 1);
      self.grid[below] = me;
      self.heights[col] += 1;
      var givesWin = self.wouldWin(col, them);
      self.heights[col] -= 1;
      delete self.grid[below];
      return !givesWin;
    });
    var choices = safe.length ? safe : cols;

    // weight columns toward the centre
    var weights = { a: 1, b: 2, c: 3, d: 4, e: 3, f: 2, g: 1 };
    var total = 0;
    choices.forEach(function (c) { total += weights[c]; });
    var roll = rand() * total;
    for (i = 0; i < choices.length; i++) {
      roll -= weights[choices[i]];
      if (roll < 0) return choices[i];
    }
    return choices[choices.length - 1];
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
