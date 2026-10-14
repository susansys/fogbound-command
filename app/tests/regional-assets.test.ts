import {test,expect} from 'vitest';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import zlib from 'node:zlib';
const dir=path.resolve('src/regional-assets'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8')),release=JSON.parse(fs.readFileSync(path.join(dir,'trusted-release.json'),'utf8'));
const sha=(b:Uint8Array)=>crypto.createHash('sha256').update(b).digest('hex');
test('MB01/03/06 complete original R has all declared bytes,32 unique tiles,authoritative field and independent river control values',()=>{
  const raw=fs.readFileSync(path.join(dir,'manifest.json'));expect(sha(raw)).toBe(release.manifest_sha256);expect(raw.length).toBe(release.manifest_bytes);
  expect(manifest.mapping.domain).toEqual([0,0,10000,10000]);expect(manifest.field).toMatchObject({width:401,height:401,step:25,encoding:'Float32LE'});
  const sizes=manifest.assets.map((asset:any)=>{const bytes=fs.readFileSync(path.join(dir,asset.file));expect(bytes.length).toBe(asset.bytes);expect(sha(bytes)).toBe(asset.sha256);expect(bytes.length).toBeLessThanOrEqual(2*1024*1024);return bytes.length;});
  expect(sizes.reduce((a:number,b:number)=>a+b,raw.length)).toBeLessThanOrEqual(32*1024*1024);
  const tiles=manifest.assets.filter((a:any)=>a.kind==='surface'||a.kind==='shade');expect(tiles).toHaveLength(32);expect(new Set(tiles.map((a:any)=>a.sha256)).size).toBe(32);
  for(const layer of ['surface','shade']){const pieces=tiles.filter((a:any)=>a.kind===layer);expect(pieces).toHaveLength(16);expect(pieces.filter((a:any)=>a.width===464)).toHaveLength(4);expect(pieces.filter((a:any)=>a.height===464)).toHaveLength(4);expect(pieces.reduce((n:number,a:any)=>n+a.width*a.height,0)).toBe(4000000);}
  const mask=fs.readFileSync(path.join(dir,'valid.bin'));expect(mask.length).toBe(160801);expect(mask.every(v=>v===1)).toBe(true);
  const field=fs.readFileSync(path.join(dir,'height.bin'));expect(field.length).toBe(643204);
  const at=(u:number,v:number)=>field.readFloatLE(((v/25)*401+u/25)*4);
  expect(at(7000,0)).toBe(60);expect(at(7375,2500)).toBe(30);expect(at(7000,5000)).toBe(0);expect(at(6625,7500)).toBe(-30);expect(at(7000,10000)).toBe(-60);
  for(let sectorV=0;sectorV<4;sectorV++)for(let sectorU=0;sectorU<4;sectorU++){
    const values=[];for(let j=sectorV*100;j<=sectorV*100+100;j++)for(let i=sectorU*100;i<=sectorU*100+100;i++){const value=field.readFloatLE((j*401+i)*4);expect(Number.isFinite(value)).toBe(true);values.push(value);}
    expect(Math.max(...values)-Math.min(...values)).toBeGreaterThan(5);
  }
});

test('MB03 the shipped surface has opaque full coverage, downhill rivers, common junction and bridges only at declared road/water intersections',()=>{
  const field=fs.readFileSync(path.join(dir,'height.bin'));
  let previous=Infinity;
  for(let j=0;j<=400;j++){
    const v=j*25,u=7000+550*Math.sin(2*Math.PI*v/10000)+180*Math.sin(6*Math.PI*v/10000);
    const value=field.readFloatLE((j*401+Math.round(u/25))*4);
    expect(value).toBeLessThanOrEqual(previous+0.00001);previous=value;
  }
  expect(field.readFloatLE((300*401+265)*4)).toBe(-30);
  const tiles=new Map<string,{width:number;scan:Buffer}>();
  for(const asset of manifest.assets.filter((a:any)=>a.kind==='surface'||a.kind==='shade')){
    const raw=fs.readFileSync(path.join(dir,asset.file)),chunks=[];let offset=8;
    while(offset<raw.length){const length=raw.readUInt32BE(offset),kind=raw.toString('ascii',offset+4,offset+8);if(kind==='IDAT')chunks.push(raw.subarray(offset+8,offset+8+length));offset+=12+length;}
    const scan=zlib.inflateSync(Buffer.concat(chunks));expect(scan.length).toBe(asset.height*(asset.width*4+1));
    for(let y=0;y<asset.height;y++){expect(scan[y*(asset.width*4+1)]).toBe(0);for(let x=0;x<asset.width;x++)if(scan[y*(asset.width*4+1)+x*4+4]!==255)throw Error('Transparent hole in shipped region');}
    tiles.set(asset.file,{width:asset.width,scan});
  }
  const colour=(u:number,v:number)=>{
    const x=Math.min(1999,Math.floor(u/5)),y=Math.min(1999,Math.floor(v/5)),tile=tiles.get(`surface-${Math.floor(y/512)}-${Math.floor(x/512)}.png`)!;
    const offset=(y%512)*(tile.width*4+1)+(x%512)*4+1;return Array.from(tile.scan.subarray(offset,offset+3));
  };
  for(const [u,v] of [[7000,0],[7375,2500],[7000,5000],[6625,7500],[7000,10000]])expect(colour(u,v)).toEqual([39,78,90]);
  for(const [u,v] of manifest.decoration.bridges){expect([2400,7400]).toContain(v);expect(colour(u,v)).toEqual([172,160,119]);}
});
