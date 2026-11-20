// Run with: node docs/test/connect4.test.js
const assert = require('assert');
const Connect4 = require('../js/connect4.js');
const play = (cols, opts) => { const g = new Connect4(opts); cols.forEach(c => g.dropChecker(c)); return g; };

// vertical (red: a a a a, yellow: b b b)
let g = play(['a','b','a','b','a','b','a']);
assert.strictEqual(g.winner, 'red'); assert.deepStrictEqual(g.winningSeq, ['a1','a2','a3','a4']);
// horizontal
g = play(['a','a','b','b','c','c','d']);
assert.strictEqual(g.winner, 'red'); assert.deepStrictEqual(g.winningSeq, ['a1','b1','c1','d1']);
// diagonal up-right: red a1 b2 c3 d4
g = play(['a','b','b','c','c','d','c','d','d','g','d']);
assert.strictEqual(g.winner, 'red'); assert.deepStrictEqual(g.winningSeq, ['a1','b2','c3','d4']);
// diagonal down-right: red d1 c2 b3 a4
g = play(['d','c','c','b','b','a','b','a','a','g','a']);
assert.strictEqual(g.winner, 'red'); assert.deepStrictEqual(g.winningSeq, ['a4','b3','c2','d1']);
// no moves after game over, full column refused
assert.strictEqual(g.dropChecker('e'), null);
g = play(['a','a','a','a','a','a']); assert.strictEqual(g.dropChecker('a'), null);
// tie: play random games until one fills the board, then check it was scored a tie
let seed = 1; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let tie = null;
for (let n = 0; n < 5000 && !tie; n++) {
  g = new Connect4();
  while (!g.gameOver) g.dropChecker(g.pickCol(1, rand));
  if (g.status === 'tie') tie = g;
}
assert.ok(tie, 'expected a tie game'); assert.strictEqual(tie.history.length, 42); assert.strictEqual(tie.winner, null);
// history round trip + undo
g = play(['d','d','e']); assert.strictEqual(g.getHistory(), 'R-d1-d2-e1');
const g2 = Connect4.fromHistory('R-d1-d2-e1'); assert.deepStrictEqual(g2.grid, g.grid); assert.strictEqual(g2.currentTurn, 'yellow');
g = play(['a','b','a','b','a','b','a']); g.undo(); assert.strictEqual(g.gameOver, false); assert.strictEqual(g.currentTurn, 'red');
// yellow first
g = new Connect4({firstMove:'yellow'}); g.dropChecker('a'); assert.strictEqual(g.grid.a1, 'yellow');
// medium AI wins / blocks
g = play(['a','b','a','b','a']); assert.strictEqual(g.pickCol(2), 'a'); // yellow must block red's column
g = play(['a','b','a','b','a','b']); assert.strictEqual(g.pickCol(2), 'a'); // red takes its own win first
// stats
g = new Connect4(); let st = g.stats();
assert.strictEqual(Connect4.LINES.length, 69); assert.strictEqual(st.movesLeft, 42);
assert.strictEqual(st.red.open, 69); assert.strictEqual(st.yellow.open, 69); assert.strictEqual(st.red.movesLeft, 21);
g.dropChecker('d'); st = g.stats();  // red d1: kills yellow lines through d1 (1 vertical, 4 horizontal... counted below)
const through = Connect4.LINES.filter(l => l.includes('d1')).length;
assert.strictEqual(st.yellow.open, 69 - through); assert.strictEqual(st.red.open, 69);
assert.strictEqual(st.red.byCount[1], through); assert.strictEqual(st.movesLeft, 41); assert.strictEqual(st.red.movesLeft, 20);
g = play(['a','b','a','b','a']); st = g.stats(); assert.ok(st.red.byCount[3] >= 1);
console.log('all tests passed');

