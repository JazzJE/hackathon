const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateLines}=require('../src/drawing');
test('saved drawings copy valid strokes and reject malformed shapes and coordinates',()=>{
  const lines=[{tool:'circle',size:5,points:[[80,90],[10,20]]}];
  const saved=validateLines(lines,100,100);
  assert.deepEqual(saved,lines);
  lines[0].points[0][0]=99;
  assert.equal(saved[0].points[0][0],80);
  for(const line of [
    {tool:'circle',size:5,points:[[0,0]]},
    {tool:'box',size:5,points:[[0,0],[Infinity,0]]},
    {tool:'pen',size:5,points:[[301,0]]},
    {tool:'pen',size:0,points:[[0,0]]},
    {tool:'unknown',size:5,points:[[0,0]]}
  ])assert.throws(()=>validateLines([line],100,100));
});
test('saved drawings reject excessive strokes and point counts',()=>{
  const line={tool:'pen',size:5,points:[[0,0]]};
  assert.throws(()=>validateLines(Array(1001).fill(line),100,100));
  assert.throws(()=>validateLines([{...line,points:Array(80001).fill([0,0])}],100,100));
});
