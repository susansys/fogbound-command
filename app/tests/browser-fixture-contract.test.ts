import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {transpileModule,ScriptTarget} from 'typescript';
import {outcome_definition_by_ref,outcome_definition_for_package,load_outcome_definition} from '../src/core/outcome-definition';
import {hash} from '../src/core/scenario';

test('MB13 bootstrap holds early inputs until the actual import is ready, replaying each once in FIFO order',async()=>{
 const source=readFileSync('browser/map-b-outcomes.spec.ts','utf8');
 const template=source.match(/const script=`([\s\S]*?)`;/)![1];
 const script=new Function('url','return `'+template+'`;')('fixture-module') as string;
 expect(script).toContain('await import("fixture-module");');
 const self=new EventTarget(),seen:unknown[]=[];let release!:()=>void;
 const ready=new Promise<void>(resolve=>{release=resolve;});
 const bootstrap=async()=>{await ready;self.addEventListener('message',event=>seen.push((event as MessageEvent).data));};
 const AsyncFunction=Object.getPrototypeOf(async()=>{}).constructor;
 const finished=new AsyncFunction('self','IDBObjectStore','crypto','MessageEvent','structuredClone','bootstrap',script.replace('await import("fixture-module");','await bootstrap();'))(self,{prototype:{put(){}}},{},MessageEvent,structuredClone,bootstrap);
 const inputs=[{request_id:'early-1'},{request_id:'early-2'}];for(const data of inputs)self.dispatchEvent(new MessageEvent('message',{data}));expect(seen).toEqual([]);
 release();await finished;self.dispatchEvent(new MessageEvent('message',{data:{request_id:'ready-3'}}));expect(seen).toEqual([...inputs,{request_id:'ready-3'}]);
});

test('current hard-boundary browser identity matches independently hashed registration while historical identity remains loadable',async()=>{
 const current=outcome_definition_by_ref('B24-OUTCOME-HARD-BOUNDARY-02');
 const {definition_hash,...body}=current;expect(await hash(body)).toBe(definition_hash);expect(await hash(current.profile)).toBe(current.hashes.profile);
 await expect(load_outcome_definition(current)).resolves.toEqual(current);
 const source=readFileSync('browser/outcome-ending.spec.ts','utf8');
 const expected=source.match(/const beforeIdentity=[\s\S]*?definition_hash:'([^']+)',hashes:\{profile:'([^']+)'/)!;
 expect(expected[1]).toBe(definition_hash);expect(expected[2]).toBe(current.hashes.profile);
 const legacy=outcome_definition_for_package('8088414ed5da24e2894bc77bdbacf29b2bb68c21af1dc3934b7f8c12566ed744');
 expect(legacy.profile.outcome.decision_evaluation).toBeUndefined();expect(current.profile.outcome.decision_evaluation).toBeDefined();
 const {definition_hash:oldHash,...oldBody}=legacy;expect(await hash(oldBody)).toBe(oldHash);await expect(load_outcome_definition(legacy)).resolves.toEqual(legacy);
});

test('uncertain-pause fixture starts at the actual committed request after a definitive stale reply',()=>{
 const source=readFileSync('browser/transport.spec.ts','utf8'),init=source.match(/await page\.addInitScript\(\(\)=>\{([\s\S]*?)\n  \}\);/)![1];
 class NativeWorker{onmessage:((event:MessageEvent)=>void)|null=null;postMessage(_input:unknown){}receive(data:unknown){this.onmessage?.(new MessageEvent('message',{data}));}}
 const owned:any={Worker:NativeWorker};
 const body=transpileModule(init,{compilerOptions:{target:ScriptTarget.ES2022}}).outputText;
 new Function('window','MessageEvent','structuredClone',body)(owned,MessageEvent,structuredClone);
 const worker=new owned.Worker(),delivered:any[]=[];worker.onmessage=(event:MessageEvent)=>delivered.push(event.data);
 const early={request_id:'stale',envelope:{intent:{kind:'pause'},operation_id:'old',expected_revision:1}},original={request_id:'committed',envelope:{intent:{kind:'pause'},operation_id:'same',expected_revision:2}},retry={...original,request_id:'retry'};
 worker.postMessage(early);worker.receive({request_id:'stale',ok:false,code:'STALE_REVISION'});expect(owned.pauseWitness.uncertainStart).toBe(-1);
 worker.postMessage(original);worker.receive({request_id:'committed',ok:true,receipt:{kind:'pause'}});worker.postMessage(retry);worker.receive({request_id:'retry',ok:true,receipt:{kind:'pause'}});
 expect(owned.pauseWitness.uncertainStart).toBe(1);expect(owned.pauseWitness.requests).toHaveLength(3);expect(owned.controls.slice(1)).toEqual([original.envelope,original.envelope]);
 expect(owned.pauseWitness.replies).toHaveLength(3);expect(delivered.map(reply=>reply.code??reply.receipt?.kind)).toEqual(['STALE_REVISION','CHANNEL_UNCERTAIN','pause']);
});
