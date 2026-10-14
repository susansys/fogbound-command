import {test,expect} from 'vitest';
import {sampleSimulationHeight} from '../src/regional-terrain';

test('MB15 the public simulation field returns independent bilinear centre40, valid zero/negative and bounded edges',()=>{
  const field={width:2,height:2,step:25,values:new Float32Array([0,100,-20,80]),mask:new Uint8Array([1,1,1,1])};
  expect(sampleSimulationHeight(field,12.5,12.5)).toBe(40);
  expect(sampleSimulationHeight(field,0,0)).toBe(0);
  expect(sampleSimulationHeight(field,0,25)).toBe(-20);
  expect(sampleSimulationHeight(field,25,25)).toBe(80);
  expect(sampleSimulationHeight(field,25,0)).toBe(100);
  expect(sampleSimulationHeight(field,-.01,0)).toBeNull();
  expect(sampleSimulationHeight(field,25.01,25)).toBeNull();
});

test('MB15 an invalid neighbour never interpolates through a mask hole or nonfinite value',()=>{
 const field={width:2,height:2,step:25,values:new Float32Array([0,100,-20,80]),mask:new Uint8Array([1,0,1,1])};
 expect(sampleSimulationHeight(field,12.5,12.5)).toBeNull();
 expect(sampleSimulationHeight(field,0,0)).toBeNull();
 field.mask[1]=1;field.values[1]=NaN;expect(sampleSimulationHeight(field,12.5,12.5)).toBeNull();
 expect(sampleSimulationHeight(field,Infinity,0)).toBeNull();
});
