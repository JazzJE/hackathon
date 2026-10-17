const {test}=require('node:test');
const assert=require('node:assert/strict');
const {recognizeX,recognizeMoney}=require('../src/gestures');
test('X recognition locates the actual intersection rather than the current tab',()=>{
  assert.deepEqual(recognizeX([{points:[[100,20],[150,70]]},{points:[[150,20],[100,70]]}]),{x:125,y:45});
  assert.deepEqual(recognizeX([{points:[[150,70],[100,20]]},{points:[[100,70],[150,20]]}]),{x:125,y:45});
});
test('uncrossed strokes, curved marks, dots, and erasing do not trigger tab close',()=>{
  for(const strokes of [[],[{points:[[1,1],[50,50]]}],[{points:[[10,10],[50,50]]},{points:[[80,10],[120,50]]}],[{points:[[10,10],[20,70],[50,50]]},{points:[[50,10],[10,50]]}],[{erase:true,points:[[10,10],[50,50]]},{points:[[50,10],[10,50]]}],[{points:[[1,1],[2,2]]},{points:[[2,1],[1,2]]}]])assert.equal(recognizeX(strokes),null);
});
test('invalid stroke coordinates cannot generate a native click',()=>{
  assert.equal(recognizeX([{points:[[NaN,10],[50,50]]},{points:[[50,10],[10,50]]}]),null);
});
test('a dollar sign takes the instant money route but X and a plain line do not',()=>{
  const curve={points:[[820,240],[750,200],[650,220],[600,280],[650,350],[750,390],[800,450],[760,520],[660,540],[590,500]]},line={points:[[700,160],[700,580]]};
  assert.equal(recognizeMoney([curve,line]),true);assert.equal(recognizeMoney([line,curve]),true);
  assert.equal(recognizeMoney([{points:[[100,20],[150,70]]},{points:[[150,20],[100,70]]}]),false);
  assert.equal(recognizeMoney([line]),false);
});
