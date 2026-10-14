import {test,expect} from 'vitest';
import fs from 'node:fs';
import crypto from 'node:crypto';
import manifest from '../src/map-assets/manifest.json';

test('MA01 actual original PNG bytes, dimensions and entire bundle budget match the authored manifest',()=>{
  let total=fs.statSync(new URL('../src/map-assets/manifest.json',import.meta.url)).size;
  for(const asset of manifest.assets){
    const bytes=fs.readFileSync(new URL('../src/map-assets/'+asset.file,import.meta.url));
    expect(bytes.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
    expect([bytes.readUInt32BE(16),bytes.readUInt32BE(20)]).toEqual([512,384]);
    expect(bytes.length).toBe(asset.bytes);expect(bytes.length).toBeLessThanOrEqual(1048576);
    expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
    total+=bytes.length;
  }
  expect(total).toBeLessThanOrEqual(2097152);
});
