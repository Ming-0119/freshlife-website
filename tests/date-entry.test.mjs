import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEnteredDate} from '../app/core.mjs';
test('date entry accepts complete year-first pasted and typed formats',()=>{
 for(const value of ['20260930','2026-9-30','2026/09/30','2026.9.30','２０２６０９３０','2026年9月30日',' 2026-09-30 '])assert.equal(parseEnteredDate(value),'2026-09-30');
});
test('date entry rejects partial, impossible and ambiguous dates without guessing',()=>{
 for(const value of ['','2026','202609','2026-02-29','2026-04-31','09/30/2026','26-09-30','2026-00-12','2026-13-01','1899-12-31','2201-01-01','202609300','2026-09-30T00:00'])assert.equal(parseEnteredDate(value),null,value);
 assert.equal(parseEnteredDate('20000229'),'2000-02-29');
 assert.equal(parseEnteredDate('19000229'),null);
 assert.equal(parseEnteredDate('19000101'),'1900-01-01');
 assert.equal(parseEnteredDate('22001231'),'2200-12-31');
});
