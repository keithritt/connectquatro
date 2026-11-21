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

console.log('solver tests passed (' + fixture.length + ' positions cross-checked)');
