import test from 'node:test';
import assert from 'node:assert/strict';
import {status} from '../site/static/app/core.mjs';
test('expiry window agrees with native calendar-day boundary across month end',()=>{
 const base='2026-09-30';
 assert.equal(status('2026-09-29',base).key,'expired');
 for(const day of ['2026-09-30','2026-10-01','2026-10-02'])assert.equal(status(day,base).key,'soon');
 assert.equal(status('2026-10-03',base).key,'fresh');
});
