// Run with: node docs/test/solver.test.js
// Positions below were solved independently with a C bitboard solver (Pons-style, exact);
// each entry is the outcome for the player to move and the move (counting the mover's as 1) on which the game ends.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const createSolver = require('../js/solver.js');
const solver = createSolver();
const cols = s => [...s].map(ch => ch.charCodeAt(0) - 97);

// 1. matches the independent solver (outcome and length)
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'solver-fixture.json'), 'utf8'));
for (const f of fixture) {
  const r = solver.think(cols(f.moves), 20000);
  assert.ok(r.proven, 'should be proven: ' + f.moves);
  assert.strictEqual(r.outcome, f.outcome, f.moves);
  if (f.outcome !== 'draw') assert.strictEqual(r.plies, f.plies, f.moves);
}

// 2. a fork wins by force: yellow d1 e1 vs red d2 d3, yellow to move, c1 (or f1) wins on yellow's 2nd move
let r = solver.think(cols('dded'), 2000);
assert.ok(['c', 'f'].includes('abcdefg'[r.col]) && r.outcome === 'win' && r.plies === 3 && r.proven);

// 3. takes an immediate win, and blocks a threat when it can't win
r = solver.think(cols('abababa'.slice(0, 6)), 1000);      // red a1 a2 a3 vs yellow b1 b2 b3, red to move
assert.strictEqual(r.col, 0); assert.strictEqual(r.plies, 1);
r = solver.think(cols('abababc'.slice(0, 5)), 1000);      // red a1 a2 a3 threatens a4; yellow b1 b2 to move
assert.strictEqual(r.col, 0);

// 4. gives up gracefully: a hard position with a short limit returns on time, unproven, with a legal move
const t0 = Date.now();
r = solver.think(cols('dc'), 300);
assert.ok(Date.now() - t0 < 1500, 'respects the time limit'); assert.strictEqual(r.proven, false);
assert.ok(r.col >= 0 && r.col < 7 && r.depth >= 1);

// 5. opening: the center column is the known winning first move
r = solver.think([], 300);
assert.strictEqual(r.col, 3); assert.strictEqual(r.proven, true); assert.strictEqual(r.theory, true);

// 6. analyze(): every legal move rated, matching the independent solver column by column
const afix = JSON.parse(fs.readFileSync(path.join(__dirname, 'analyze-fixture.json'), 'utf8'));
for (const f of afix) {
  const a = solver.analyze(cols(f.moves), 20000);
  assert.strictEqual(a.cols.length, f.cols.length, f.moves);
  for (const want of f.cols) {
    const got = a.cols.find(c => c.col === want.col);
    assert.ok(got && got.proven, 'proven ' + f.moves + ' ' + want.col);
    assert.strictEqual(got.outcome, want.outcome, f.moves + ' col ' + want.col);
    if (want.outcome !== 'draw') assert.strictEqual(got.plies, want.plies, f.moves + ' col ' + want.col);
  }
  const bestScore = Math.max(...a.cols.map(c => c.score));
  assert.strictEqual(a.cols.find(c => c.col === a.best).score, bestScore);
}
// the fork position: c1 and f1 win in 3 plies, and the empty board uses the known first-move results
let an = solver.analyze(cols('dded'), 1500);
for (const ch of 'cf') { const e = an.cols.find(c => c.col === ch.charCodeAt(0) - 97); assert.ok(e.outcome === 'win' && e.plies === 3 && e.proven); }
assert.ok(['c', 'f'].includes('abcdefg'[an.best]));
an = solver.analyze([], 300);
assert.deepStrictEqual(an.cols.map(c => c.outcome), ['loss', 'loss', 'draw', 'win', 'draw', 'loss', 'loss']);

// 7. zugzwang: a real position (red c4, yellow c5 forced, red c6, yellow must play f1, red wins on f2)
const C4 = require('../js/connect4.js');
const zpos = C4.parse('Y-d1-e1-d2-e2-d3-d4-d5-e3-e4-g1-d6-e5-g2-a1-b1-b2-e6-b3-c1-c2-c3-b4-b5-b6-g3-g4-g5-g6-a2-a3-a4-a5-a6');
const zmoves = zpos.history.map(x => x.charCodeAt(0) - 97);
let zs = solver.zugzwangScan(zmoves, 3000);
assert.ok(zs.solved && zs.outcome === 'win' && zs.zugzwang && zs.spot === 'f2' && zs.plies === 5, JSON.stringify(zs));
assert.deepStrictEqual(zs.spots, ['c4', 'c5', 'c6', 'f1', 'f2']);
let zm = solver.zugzwangMove(zmoves, 3000, 5);          // normally it would play f - which loses at once
assert.ok(zm && zm.kind === 'take' && zm.col === 2 && zm.spot === 'f2', JSON.stringify(zm));
// an immediate win is not a zugzwang
zs = solver.zugzwangScan(cols('ababab'), 1000); assert.ok(zs.solved && zs.outcome === 'win' && !zs.zugzwang);
// property over random endgames: a "take" really wins on the named square; a "defend" avoids a move that loses by zugzwang
let rseed = 5; const rr = () => (rseed = (rseed * 16807) % 2147483647) / 2147483647;
let takes = 0, defends = 0;
for (let n = 0; n < 400 && (takes < 6 || defends < 6); n++) {
  const g = new C4(); const target = 24 + Math.floor(rr() * 8);
  while (!g.gameOver && g.history.length < target) g.dropChecker(g.pickCol(1, rr));
  if (g.gameOver) continue;
  const mv = g.history.map(x => x.charCodeAt(0) - 97);
  const a = solver.analyze(mv, 2000);
  for (const e of a.cols) {
    const z = solver.zugzwangMove(mv, 2000, e.col);
    if (!z) continue;
    if (z.kind === 'take') {
      takes++;
      const h = C4.parse(g.code()); const seq = [];
      for (const sp of z.spots) { const d = h.dropChecker(sp[0]); assert.strictEqual(d, sp, 'line must replay'); }
      assert.ok(h.gameOver && h.status === 'win' && h.lastSpot() === z.spot, 'take ends in a win on ' + z.spot);
      assert.strictEqual(h.winner, g.currentTurn);
      assert.strictEqual(z.spots[z.spots.length - 2][0], z.spot[0]);          // loser played right under it
      assert.ok(g.heights[z.spot[0]] < parseInt(z.spot.slice(1), 10) - 1, 'the square was not playable yet');
    } else {
      defends++;
      const bad = a.cols.find(c => c.col === z.avoided), ok = a.cols.find(c => c.col === z.col);
      assert.ok(bad.proven && bad.outcome === 'loss', 'the avoided move loses');
      assert.ok(!(ok.proven && ok.outcome === 'loss'), 'the replacement does not lose');
      assert.strictEqual(z.avoided, e.col); assert.notStrictEqual(z.col, e.col);
    }
  }
}
assert.ok(takes >= 3 && defends >= 3, 'expected to see both: takes=' + takes + ' defends=' + defends);

console.log('zugzwang cases checked: ' + takes + ' takes, ' + defends + ' defends');
console.log('solver tests passed (' + fixture.length + ' positions cross-checked)');
