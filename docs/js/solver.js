/*
 * Connect 4 solver for the "Perfect" computer level.
 *
 * Same idea as the sample negamax (center-first column order, alpha-beta, win score = 1000 - ply so wins
 * come sooner and losses later), plus what makes it fast enough for a browser:
 *  - incremental win checks around the last checker instead of scanning the board
 *  - immediate wins, forced blocks and "you'd hand them a win on top" are decided without searching
 *  - a transposition table (Zobrist hashing) so repeated positions are only searched once
 *  - iterative deepening with a time limit: it searches 1, 2, 3 ... moves ahead and keeps the last
 *    complete answer. If the search reaches the end of the game, or finds a forced win/loss, the answer is
 *    PROVEN (true perfect play). Otherwise it is only the best guess found in the time available -
 *    early in the game a complete search needs far more time than a phone has.
 *
 * createC4Solver() must stay self-contained (no outside references): app.js turns its source text
 * into a Web Worker so the page stays responsive while it thinks.
 */
function createC4Solver() {
  'use strict';
  var W = 7, H = 6, N = 42;
  var WIN = 10000, WINT = 9900;           // |score| >= WINT means a forced win/loss was found
  var ORDER = [3, 2, 4, 1, 5, 0, 6];       // center first
  var TIMEOUT = {};

  var cells = new Int8Array(N);            // index col * 6 + row; 0 empty, 1 / 2 the players
  var hts = new Int8Array(W);
  var n = 0, h1 = 0, h2 = 0;
  var nodes = 0, deadline = 0, rootBest = -1;

  // ---- Zobrist hashing + transposition table ----
  var seed = 123456789;
  function rnd() { seed = seed ^ (seed << 13); seed = seed ^ (seed >>> 17); seed = seed ^ (seed << 5); return seed | 0; }
  var z1 = new Int32Array(N * 2), z2 = new Int32Array(N * 2), i, j;
  for (i = 0; i < N * 2; i++) { z1[i] = rnd(); z2[i] = rnd(); }
  var TT_SIZE = 1 << 20, TT_MASK = TT_SIZE - 1;
  var tk1 = new Int32Array(TT_SIZE), tk2 = new Int32Array(TT_SIZE);
  var tScore = new Int16Array(TT_SIZE), tDepth = new Int8Array(TT_SIZE);
  var tFlag = new Int8Array(TT_SIZE), tMove = new Int8Array(TT_SIZE);   // flag: 1 exact, 2 lower bound, 3 upper bound

  // ---- the 69 lines of four, for the evaluation used when the search runs out of depth ----
  var LINES = [];
  var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (var c0 = 0; c0 < W; c0++) for (var r0 = 0; r0 < H; r0++) for (var d = 0; d < 4; d++) {
    var ec = c0 + DIRS[d][0] * 3, er = r0 + DIRS[d][1] * 3;
    if (ec < 0 || ec >= W || er < 0 || er >= H) continue;
    for (var k = 0; k < 4; k++) LINES.push((c0 + DIRS[d][0] * k) * 6 + (r0 + DIRS[d][1] * k));
  }
  var NLINES = LINES.length / 4;
  var LW = [0, 1, 6, 30, 0];
  var CW = [0, 1, 2, 4, 2, 1, 0];

  function evalPos(p) {
    var s = 0;
    for (var l = 0; l < NLINES; l++) {
      var m = 0, t = 0;
      for (var q = 0; q < 4; q++) {
        var v = cells[LINES[l * 4 + q]];
        if (v === p) m++; else if (v !== 0) t++;
      }
      if (t === 0) s += LW[m]; else if (m === 0) s -= LW[t];
    }
    for (var cc = 0; cc < W; cc++) {                       // checkers nearer the center are worth a little more
      for (var rr = 0; rr < hts[cc]; rr++) s += cells[cc * 6 + rr] === p ? CW[cc] : -CW[cc];
    }
    return s;
  }

  // how many of p's checkers in a row start next to (c, r) going one way
  function cnt(c, r, dc, dr, p) {
    var k = 0;
    c += dc; r += dr;
    while (c >= 0 && c < W && r >= 0 && r < H && cells[c * 6 + r] === p) { k++; c += dc; r += dr; }
    return k;
  }
  // would p make four by dropping into (c, r)?
  function wins(c, r, p) {
    return cnt(c, r, 0, -1, p) >= 3 ||
      cnt(c, r, 1, 0, p) + cnt(c, r, -1, 0, p) >= 3 ||
      cnt(c, r, 1, 1, p) + cnt(c, r, -1, -1, p) >= 3 ||
      cnt(c, r, 1, -1, p) + cnt(c, r, -1, 1, p) >= 3;
  }

  function put(c, p) {
    var r = hts[c], zi = (c * 6 + r) * 2 + (p - 1);
    cells[c * 6 + r] = p; hts[c] = r + 1; n++; h1 ^= z1[zi]; h2 ^= z2[zi];
  }
  function take(c, p) {
    var r = hts[c] - 1, zi = (c * 6 + r) * 2 + (p - 1);
    cells[c * 6 + r] = 0; hts[c] = r; n--; h1 ^= z1[zi]; h2 ^= z2[zi];
  }

  var lists = new Int8Array(64 * 8);   // move list per ply, no allocation while searching

  // Negamax from the point of view of p (the player to move).
  // Score: +(WIN - w) if p wins with the w-th move from the root, -(WIN - w) if p loses to the opponent's w-th move.
  function search(p, depth, alpha, beta, ply) {
    if ((++nodes & 8191) === 0 && Date.now() > deadline) throw TIMEOUT;
    if (n === N) return 0;
    var q = 3 - p, c, r;

    for (c = 0; c < W; c++) {                                  // can I win right now?
      r = hts[c];
      if (r < H && wins(c, r, p)) { if (ply === 0) rootBest = c; return WIN - (ply + 1); }
    }
    var forced = -1, threats = 0;                              // must I block something?
    for (c = 0; c < W; c++) {
      r = hts[c];
      if (r < H && wins(c, r, q)) { threats++; forced = c; }
    }
    if (threats >= 2) { if (ply === 0) rootBest = forced; return -(WIN - (ply + 2)); }
    if (depth === 0) return evalPos(p);

    var idx = h1 & TT_MASK, ttMove = -1, origAlpha = alpha;
    if (tk1[idx] === h1 && tk2[idx] === h2 && tFlag[idx] !== 0) {
      ttMove = tMove[idx];
      var ts = tScore[idx];
      if (ts >= WINT) ts -= ply; else if (ts <= -WINT) ts += ply;
      var usable = tDepth[idx] >= depth || (tFlag[idx] === 1 && (ts >= WINT || ts <= -WINT));
      if (usable && ply > 0) {
        if (tFlag[idx] === 1) return ts;
        if (tFlag[idx] === 2) { if (ts > alpha) alpha = ts; } else if (ts < beta) beta = ts;
        if (alpha >= beta) return ts;
      }
    }

    var base = ply * 8, cnt2 = 0;
    if (forced >= 0) { lists[base] = forced; cnt2 = 1; }
    else {
      if (ttMove >= 0 && hts[ttMove] < H) lists[base + cnt2++] = ttMove;
      for (i = 0; i < W; i++) if (ORDER[i] !== ttMove && hts[ORDER[i]] < H) lists[base + cnt2++] = ORDER[i];
    }

    var best = -100000, bestC = -1, v;
    for (var mi = 0; mi < cnt2; mi++) {
      c = lists[base + mi];
      r = hts[c];
      put(c, p);
      if (r < H - 1 && wins(c, r + 1, q)) v = -(WIN - (ply + 2));   // dropping here hands them the win on top
      else v = -search(q, depth - 1, -beta, -alpha, ply + 1);
      take(c, p);
      if (v > best) { best = v; bestC = c; }
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    if (ply === 0) rootBest = bestC;

    var st = best;
    if (st >= WINT) st += ply; else if (st <= -WINT) st -= ply;
    tk1[idx] = h1; tk2[idx] = h2; tScore[idx] = st; tDepth[idx] = depth > 127 ? 127 : depth; tMove[idx] = bestC;
    tFlag[idx] = best <= origAlpha ? 3 : (best >= beta ? 2 : 1);
    return best;
  }

  // moves: the columns played so far (0-6), first mover first. The game must not be over.
  // Returns { col, score, depth, empties, proven, outcome: 'win'|'loss'|'draw'|'unknown', plies, nodes, ms }
  //   plies: for a win/loss, which move from now (counting yours as 1) ends the game.
  function think(moves, timeMs) {
    var t0 = Date.now();
    // Known theory: the center column is the only winning first move (Allis, 1988). Searching the empty
    // board to the end is far beyond what a browser can do, so use the result instead.
    if (moves.length === 0) {
      return { col: 3, score: WIN - 41, depth: 0, empties: N, nodes: 0, ms: 0, outcome: 'win', proven: true, plies: 0, theory: true };
    }
    cells.fill(0); hts.fill(0); n = 0; h1 = 0; h2 = 0; nodes = 0;
    for (i = 0; i < moves.length; i++) put(moves[i], (i % 2) + 1);
    var p = (n % 2) + 1, empties = N - n;
    deadline = t0 + timeMs;
    var result = null;
    for (var depth = 1; depth <= empties; depth++) {
      var score;
      try { score = search(p, depth, -100000, 100000, 0); }
      catch (e) { if (e === TIMEOUT) break; throw e; }
      result = { col: rootBest, score: score, depth: depth };
      if (score >= WINT || score <= -WINT || depth >= empties) break;
    }
    if (!result) {   // out of time before depth 1 finished (can't really happen): first legal column
      for (i = 0; i < W; i++) if (hts[ORDER[i]] < H) { result = { col: ORDER[i], score: 0, depth: 0 }; break; }
    }
    result.empties = empties;
    result.nodes = nodes;
    result.ms = Date.now() - t0;
    if (result.score >= WINT) { result.outcome = 'win'; result.proven = true; result.plies = WIN - result.score; }
    else if (result.score <= -WINT) { result.outcome = 'loss'; result.proven = true; result.plies = WIN + result.score; }
    else if (result.depth >= empties) { result.outcome = 'draw'; result.proven = true; result.plies = empties; }
    else { result.outcome = 'unknown'; result.proven = false; result.plies = 0; }
    return result;
  }

  // Evaluate EVERY legal move for the player to move (used to rate moves and to analyze a position).
  // Returns { cols: [ { col, score, depth, proven, outcome, plies } ... ] for the legal columns, best: col, depth, ms }
  // Scores are from the mover's point of view; outcome/plies work as in think().
  function analyze(moves, timeMs) {
    var t0 = Date.now();
    // Known theory for the empty board: the center column wins, its neighbours draw, the outer columns lose.
    if (moves.length === 0) {
      var known = [['loss'], ['loss'], ['draw'], ['win'], ['draw'], ['loss'], ['loss']], list = [];
      for (var kc = 0; kc < W; kc++) {
        var o = known[kc][0];
        list.push({ col: kc, score: o === 'win' ? WIN - 41 : o === 'loss' ? -(WIN - 42) : 0, depth: 0, outcome: o, proven: true, plies: 0, theory: true });
      }
      return { cols: list, best: 3, depth: 0, empties: N, ms: 0, theory: true };
    }
    cells.fill(0); hts.fill(0); n = 0; h1 = 0; h2 = 0; nodes = 0;
    for (i = 0; i < moves.length; i++) put(moves[i], (i % 2) + 1);
    var p = (n % 2) + 1, q = 3 - p, empties = N - n;
    deadline = t0 + timeMs;
    var out = [], c, r;
    for (c = 0; c < W; c++) {
      if (hts[c] >= H) continue;
      r = hts[c];
      var e = { col: c, score: 0, depth: 0, done: false };
      if (wins(c, r, p)) { e.score = WIN - 1; e.done = true; }
      else if (empties === 1) { e.score = 0; e.done = true; }
      else {
        put(c, p);
        if (r < H - 1 && wins(c, r + 1, q)) { e.score = -(WIN - 2); e.done = true; }   // hands them the win on top
        take(c, p);
      }
      out.push(e);
    }
    var depth, k, timedOut = false;
    for (depth = 1; depth < empties && !timedOut; depth++) {
      var open = 0;
      for (k = 0; k < out.length; k++) {
        var e2 = out[k];
        if (e2.done) continue;
        open++;
        put(e2.col, p);
        try { e2.score = -search(q, depth, -100000, 100000, 1); }
        catch (err) { take(e2.col, p); if (err === TIMEOUT) { timedOut = true; break; } throw err; }
        take(e2.col, p);
        e2.depth = depth;
        if (e2.score >= WINT || e2.score <= -WINT || depth >= empties - 1) e2.done = true;
      }
      if (!open) break;
    }
    var best = -1, bestScore = -100000;
    for (k = 0; k < out.length; k++) {
      var f = out[k];
      if (f.score >= WINT) { f.outcome = 'win'; f.proven = true; f.plies = WIN - f.score; }
      else if (f.score <= -WINT) { f.outcome = 'loss'; f.proven = true; f.plies = WIN + f.score; }
      else if (f.done) { f.outcome = 'draw'; f.proven = true; f.plies = 0; }
      else { f.outcome = 'unknown'; f.proven = false; f.plies = 0; }
      if (f.score > bestScore) { bestScore = f.score; best = f.col; }
      delete f.done;
    }
    return { cols: out, best: best, depth: timedOut ? depth - 1 : depth, empties: empties, ms: Date.now() - t0 };
  }

  // ---- zugzwang ----
  // A win "by zugzwang" is one that ends on a square that could not be played yet, because the loser is finally
  // forced to play directly underneath it by running out of safe moves. If the loser played underneath only to
  // block an immediate threat, that is an ordinary forcing sequence, not zugzwang.

  // can player p win immediately somewhere right now?
  function hasImmediateWin(p) {
    for (var c = 0; c < W; c++) { var r = hts[c]; if (r < H && wins(c, r, p)) return true; }
    return false;
  }

  // Play the best line out for both sides from `moves` (optionally forcing the first move) and report how it ends.
  function principalLine(moves, ms, firstCol) {
    var seq = moves.slice(), line = [], t0 = Date.now(), c, p, row, win;
    if (firstCol !== undefined && firstCol !== null) {
      cells.fill(0); hts.fill(0); n = 0; h1 = 0; h2 = 0;
      for (i = 0; i < seq.length; i++) put(seq[i], (i % 2) + 1);
      p = (n % 2) + 1; row = hts[firstCol]; win = wins(firstCol, row, p);
      line.push({ col: firstCol, row: row + 1, player: p, win: win, forced: hasImmediateWin(3 - p) });
      seq.push(firstCol);
      if (win) return line;
    }
    while (seq.length < N) {
      var left = ms - (Date.now() - t0);
      if (left < 30) return null;
      var r = think(seq, left);
      if (!r.proven || r.col < 0 || r.theory) return null;
      p = (seq.length % 2) + 1; c = r.col; row = hts[c];            // think() leaves the board at `seq`
      win = wins(c, row, p);
      line.push({ col: c, row: row + 1, player: p, win: win, forced: hasImmediateWin(3 - p) });
      seq.push(c);
      if (win) break;
    }
    return line;
  }

  // does this line end by zugzwang? startHts: column heights before the line began
  function classifyLine(line, startHts) {
    var last = line && line[line.length - 1];
    if (!last || !last.win) return { zug: false };
    var prev = line[line.length - 2];
    var zug = !!prev && prev.col === last.col && prev.row === last.row - 1 && startHts[last.col] < last.row - 1 && !prev.forced;
    return { zug: zug, spot: 'abcdefg'[last.col] + last.row, winnerPlayer: last.player, plies: line.length, spots: line.map(function (x) { return 'abcdefg'[x.col] + x.row; }) };
  }
  function heightsOf(moves) { var h = [0, 0, 0, 0, 0, 0, 0]; for (var k = 0; k < moves.length; k++) h[moves[k]]++; return h; }

  // Solve the position (if it can be solved in time) and say whether the result is a zugzwang win.
  // Returns { solved, outcome: 'win'|'loss'|'draw' (for the player to move), zugzwang, spot, plies, spots }
  function zugzwangScan(moves, timeMs) {
    var t0 = Date.now();
    var r = think(moves, timeMs * 0.5);
    if (!r.proven || r.theory) return { solved: false, empties: N - moves.length };
    if (r.outcome === 'draw') return { solved: true, outcome: 'draw', zugzwang: false };
    var line = principalLine(moves, Math.max(100, timeMs - (Date.now() - t0)));
    var cl = classifyLine(line, heightsOf(moves));
    var res = { solved: true, outcome: r.outcome, zugzwang: cl.zug, plies: r.plies };
    if (cl.spot) { res.spot = cl.spot; res.spots = cl.spots; }
    return res;
  }

  // For the computer's turn. `defCol` is the column it would normally play.
  // Returns { kind: 'take', col, spot, plies } if some move wins by zugzwang,
  //         { kind: 'defend', col, avoided, spot } if defCol would lose by zugzwang and another move doesn't,
  //         or null (nothing zugzwang-related to do, or not solvable in time).
  function zugzwangMove(moves, timeMs, defCol) {
    var t0 = Date.now(), startHts = heightsOf(moves), k, e, cl, line;
    var a = analyze(moves, timeMs * 0.5);
    var rest = function () { return Math.max(100, timeMs - (Date.now() - t0)); };
    var bestTake = null, fastest = 1000;
    for (k = 0; k < a.cols.length; k++) if (a.cols[k].proven && a.cols[k].outcome === 'win' && a.cols[k].plies < fastest) fastest = a.cols[k].plies;
    for (k = 0; k < a.cols.length; k++) {
      e = a.cols[k];
      // only a zugzwang win that is also the fastest win: no slow squeeze when a quick win exists
      if (!(e.proven && e.outcome === 'win') || e.plies <= 1 || e.plies > fastest) continue;
      line = principalLine(moves, rest() / 2, e.col);
      cl = classifyLine(line, startHts);
      if (cl.zug && (!bestTake || cl.plies < bestTake.plies)) bestTake = { kind: 'take', col: e.col, spot: cl.spot, plies: e.plies, spots: cl.spots };
    }
    if (bestTake) return bestTake;
    if (defCol === undefined || defCol === null) return null;
    for (k = 0; k < a.cols.length; k++) {
      e = a.cols[k];
      if (e.col !== defCol || !(e.proven && e.outcome === 'loss')) continue;
      line = principalLine(moves, rest(), defCol);
      cl = classifyLine(line, startHts);
      if (!cl.zug) return null;
      var alts = a.cols.filter(function (x) { return x.col !== defCol && !(x.proven && x.outcome === 'loss'); });
      if (!alts.length) return null;
      var pick = alts[0];
      for (var m = 1; m < alts.length; m++) if (alts[m].score > pick.score) pick = alts[m];
      return { kind: 'defend', col: pick.col, avoided: defCol, spot: cl.spot, plies: e.plies, spots: cl.spots };
    }
    return null;
  }

  return { think: think, analyze: analyze, zugzwangScan: zugzwangScan, zugzwangMove: zugzwangMove };
}

if (typeof module !== 'undefined' && module.exports) module.exports = createC4Solver;
else if (typeof window !== 'undefined') window.createC4Solver = createC4Solver;
