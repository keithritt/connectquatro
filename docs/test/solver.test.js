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

console.log('solver tests passed (' + fixture.length + ' positions cross-checked)');
