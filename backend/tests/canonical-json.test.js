import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson } from '../src/canonical-json.js';

test('canonical JSON sorts nested object keys but preserves array order and values',()=>{
  assert.equal(canonicalJson({z:1,a:{y:true,x:null},items:[{b:2,a:1},false]}),'{"a":{"x":null,"y":true},"items":[{"a":1,"b":2},false],"z":1}');
  assert.equal(canonicalJson({a:1,b:2}),canonicalJson({b:2,a:1}));
  assert.notEqual(canonicalJson([1,2]),canonicalJson([2,1]));
});
