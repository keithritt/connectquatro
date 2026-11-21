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
// sevens
assert.strictEqual(Connect4.SEVENS.length, 24);
Connect4.SEVENS.forEach(sv => { assert.strictEqual(new Set(sv.spots).size, 7); assert.strictEqual(sv.spots[0], sv.corner); });
assert.deepStrictEqual(Connect4.SEVENS.find(sv => sv.corner === 'g4').spots, ['g4','f4','e4','d4','f3','e2','d1']); // a classic 7
assert.deepStrictEqual(Connect4.SEVENS.find(sv => sv.corner === 'a4').spots, ['a4','b4','c4','d4','b3','c2','d1']); // mirror image
g = new Connect4(); st = g.stats(); assert.strictEqual(st.red.sevens, 24); assert.strictEqual(st.yellow.sevens, 24);
g.dropChecker('d'); st = g.stats(); // red d1 sits in two sevens (corners g4 and a4): yellow loses both
assert.strictEqual(st.red.sevens, 24); assert.strictEqual(st.yellow.sevens, 22); assert.strictEqual(st.red.sevensClose, 0);
g = new Connect4(); g.grid.g4 = 'red'; st = g.stats(); // occupied corner kills that seven for both; g4 is also in another seven's bar
assert.strictEqual(st.red.sevens, 23); assert.strictEqual(st.yellow.sevens, 22);
g = new Connect4(); g.grid.d4 = 'red'; g.grid.e4 = 'red'; st = g.stats(); // two red checkers in the g4 seven
assert.ok(st.red.sevensClose >= 1);
// move reasons
g = play(['a','b','a','b','a','b']); let mv = g.pickMove(2); // red to move, red has a1-a3
assert.strictEqual(mv.col, 'a'); assert.strictEqual(mv.reason, 'win'); assert.ok(/victory/.test(mv.text));
g = play(['a','b','a','b','a']); mv = g.pickMove(2); // yellow to move, red threatens a4
assert.strictEqual(mv.col, 'a'); assert.strictEqual(mv.reason, 'block'); assert.ok(/block your Connect Four/.test(mv.text));
// nothing obvious -> middle column, whatever the dice say
g = new Connect4();
for (const r of [0.01, 0.5, 0.99]) { mv = g.pickMove(2, () => r); assert.strictEqual(mv.col, 'd'); assert.strictEqual(mv.reason, 'center'); }
// middle column full -> random pick among the other columns (the dice decide)
g = play(['d','d','d','d','d','d']); assert.strictEqual(g.heights.d, 6);
const picked = new Set();
for (const r of [0.01, 0.2, 0.4, 0.6, 0.8, 0.99]) { mv = g.pickMove(2, () => r); picked.add(mv.col); assert.notStrictEqual(mv.col, 'd'); assert.strictEqual(mv.reason, 'random'); assert.ok(/is full/.test(mv.text) && /random/.test(mv.text)); }
assert.ok(picked.size > 1, 'random pick should vary');
mv = g.pickMove(1, () => 0.1); assert.strictEqual(mv.reason, 'random'); assert.ok(/Easy/.test(mv.text));
// avoiding a setup: red has b2 c2 d2, so yellow must not play a1 or e1 (that lets red win on a2/e2)
g = play(['c','b','b','d','c','g','d']); assert.strictEqual(g.currentTurn, 'yellow');
for (const r of [0.01, 0.2, 0.4, 0.6, 0.8, 0.99]) {
  mv = g.pickMove(2, () => r);
  assert.ok(!['a','e'].includes(mv.col), 'must avoid a and e, got ' + mv.col);
  assert.ok(/Avoided a2, e2/.test(mv.text), mv.text);
}
// position codes
g = Connect4.parse('R-d1-d2-e1'); assert.ok(g); assert.strictEqual(g.code(), 'R-d1-d2-e1'); assert.strictEqual(g.currentTurn, 'yellow');
assert.strictEqual(Connect4.parse('https://example.com/play/#y-D1-d2').code(), 'Y-d1-d2'); // a pasted link, any case
assert.strictEqual(new Connect4().code(), 'R'); assert.strictEqual(new Connect4({ firstMove: 'yellow' }).code(), 'Y'); assert.strictEqual(Connect4.parse('Y').firstMove, 'yellow');
for (const bad of ['', 'X-d1', 'R-d2', 'R-d1-d1', 'R-h1', 'R-d1-', 'R-a1-b1-a2-b2-a3-b3-a4-a5', 'garbage']) assert.strictEqual(Connect4.parse(bad), null, bad);
assert.strictEqual(Connect4.parse('R-a1-b1-a2-b2-a3-b3-a4').status, 'win');
assert.strictEqual(Connect4.parse('R-a1-b1-a2-b2-a3-b3-a4-c1'), null); // nothing after a win
// round trip over random games
for (let n = 0; n < 200; n++) { g = new Connect4({ firstMove: n % 2 ? 'yellow' : 'red' }); while (!g.gameOver) g.dropChecker(g.pickCol(1, rand)); const g2 = Connect4.parse(g.code()); assert.ok(g2); assert.deepStrictEqual(g2.grid, g.grid); assert.strictEqual(g2.status, g.status); }
console.log('all tests passed');

