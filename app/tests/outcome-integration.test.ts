import {test,expect,vi} from 'vitest';
import Dexie from 'dexie';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import definition from '../src/core/outcome-definition.json';
import * as Snapshot from '../src/core/snapshot';
import {hash} from '../src/core/scenario';
import {outcome_definition_for_package} from '../src/core/outcome-definition';

function observedOutcomeDigest(value:unknown):string|null{
 return value!==null&&typeof value==='object'&&Reflect.get(value,'schema')===10&&typeof Reflect.get(value,'integrity')==='string'?Reflect.get(value,'integrity'):null;
}

test('B24 the one diagnostic accepts only the owned loopback browser endpoint and preserves its four actual launch arguments',()=>{
 // These standalone Node helpers are outside TypeScript's input set.
 execFileSync(process.execPath,['--check',path.resolve('verification/outcome-history-budget.mjs')],{encoding:'utf8',timeout:10000,maxBuffer:1000000});
 const helper=new URL('../verification/outcome-native-recovery.mjs',import.meta.url).href;
 const program=`import assert from 'node:assert/strict';import {diagnosticArguments,diagnosticEndpoint} from ${JSON.stringify(helper)};
 const profile='D:/owned/no-account-profile',args=diagnosticArguments(profile);assert.deepEqual(args,['--user-data-dir='+profile,'--remote-debugging-port=0','--no-first-run','--no-default-browser-check']);
 const input={active_port:'43111\\n/devtools/browser/01234567-89ab-cdef-0123-456789abcdef\\n',browser_pid:17,listeners:[{address:'127.0.0.1',port:43111,pid:17}]};
 assert.deepEqual(diagnosticEndpoint(input),{address:'127.0.0.1',port:43111,pid:17,path:'/devtools/browser/01234567-89ab-cdef-0123-456789abcdef',ownership_verified:true,verified_before_connect:true});
 for(const wrong of [{...input,active_port:'43111junk\\n/devtools/browser/01234567-89ab-cdef-0123-456789abcdef'},{...input,active_port:'43111\\n/../unknown'},{...input,listeners:[]},{...input,listeners:[{address:'0.0.0.0',port:43111,pid:17}]},{...input,listeners:[{address:'127.0.0.1',port:43111,pid:18}]},{...input,listeners:[{address:'127.0.0.1',port:43112,pid:17}]}])assert.throws(()=>diagnosticEndpoint(wrong));`;
 execFileSync(process.execPath,['--input-type=module','-e',program],{encoding:'utf8',timeout:10000,maxBuffer:1000000});
});

test('B24 E52 1.0.3 comparison identity preserves raw DPR and requires exact recorded environment evidence without a general tolerance',()=>{
 const helper=new URL('../verification/outcome-visual-comparison.mjs',import.meta.url).href;
 const program=`import assert from 'node:assert/strict';import {visualDprIdentity,expectedVisualScale,reportVisibleColumn} from ${JSON.stringify(helper)};
 const input={requested:1,actual:1.0000000149011612,carrier:'chrome',browser_version:'155.0.8059.82',executable:'C:/owned/chrome.exe',viewport:[1366,768],zoom:1,capture:{screenshot_scale:'device',png_ihdr:[1366,768],requested_context:{viewport:{width:1366,height:768},deviceScaleFactor:1}},native_display:{available:true,windows:[{pid:17,hwnd:'owned-window',dpi:120}]},registered:{carrier:'chrome',browser_version:'155.0.8059.82',executable:'C:/owned/chrome.exe',css_viewport:[1366,768],raw_DPR_exact:1.0000000149011612,default_windows_installation:true,custom_launch_args:[],network_or_permission_changes:false}};
 // Hypothetical complete native records exercise the rule. Actual historical
 // captures lacking these fields must remain unrecognized, never backfilled.
 const native={dpi:120,awareness:2,monitor:{bounds:{left:0,top:0,right:1920,bottom:1080},work:{left:0,top:0,right:1920,bottom:1040},flags:1}};Object.assign(input.native_display,{os_version:'owned-test-Windows'});Object.assign(input.native_display.windows[0],native);input.registered.native_configuration={os_version:'owned-test-Windows',windows:[native]};
 const accepted=visualDprIdentity(input);assert.equal(accepted.recognized,true);assert.equal(accepted.actual_dpr,input.actual);assert.equal(accepted.requested_dpr,1);assert.equal(accepted.target_identity_basis,'B24-OUTCOME-DESIGN-1.0.3');
 assert.equal(visualDprIdentity({...input,registered:{...input.registered,native_configuration:undefined}}).recognized,false);assert.equal(visualDprIdentity({...input,native_display:{...input.native_display,windows:[{...input.native_display.windows[0],dpi:144}]}}).recognized,false);
 for(const invalid of [{...input,actual:1.00000001},{...input,browser_version:'156.0.0.0'},{...input,native_display:{available:false,windows:[]}},{...input,capture:{...input.capture,png_ihdr:[1367,768]}},{...input,zoom:1.01}])assert.equal(visualDprIdentity(invalid).recognized,false);
 assert.equal(visualDprIdentity({...input,requested:1.25,actual:1.25}).recognized,true);assert.equal(visualDprIdentity({...input,requested:1.25,actual:1.25000001}).recognized,false);
 assert.deepEqual(expectedVisualScale('reference',.804),{value:100,css_line_px:80,rule:'fixed100-round-css-pixel'});assert.deepEqual(expectedVisualScale('current',1),{value:100,css_line_px:100,rule:'nice-step-below100-css-pixels'});assert.deepEqual(expectedVisualScale('current',2),{value:50,css_line_px:100,rule:'nice-step-below100-css-pixels'});assert.throws(()=>expectedVisualScale('current',0));
 const box=(x,y,width,height)=>({x,y,width,height,left:x,top:y,right:x+width,bottom:y+height});
 assert.deepEqual(reportVisibleColumn({workbody:box(82,150,1284,460),list:box(82,150,320,460)}),box(402,150,964,460));assert.throws(()=>reportVisibleColumn({workbody:box(82,150,1284,460),list:box(90,150,320,460)}));`;
 execFileSync(process.execPath,['--input-type=module','-e',program],{encoding:'utf8',timeout:10000,maxBuffer:1000000});
});

test('B24 E52 the approved current pair retains raw DPR and requires a complete stable native registration',()=>{
 const helper=new URL('../verification/outcome-visual-comparison.mjs',import.meta.url).href;
 const program=`import assert from 'node:assert/strict';import {visualCurrentPairDprIdentity} from ${JSON.stringify(helper)};
 const native={os_version:'owned-Windows',available:true,windows:[{pid:17,hwnd:'owned',dpi:120,awareness:2,monitor:{bounds:{left:0,top:0,right:1920,bottom:1080},work:{left:0,top:0,right:1920,bottom:1040},flags:1}}]};
 const registration={version:'B24-CURRENT-PAIR-NATIVE-VERIFICATION-1',registered_at:'2026-10-18T09:00:00Z',carrier:'chrome',browser_version:'155.0.8059.82',executable:'C:/owned/chrome.exe',css_viewport:[1366,768],raw_DPR_exact:1.0000000149011612,default_windows_installation:true,custom_launch_args:[],network_or_permission_changes:false,native_configuration:{os_version:native.os_version,windows:native.windows.map(({dpi,awareness,monitor})=>({dpi,awareness,monitor}))}};
 const input={requested:1,actual:1.0000000149011612,carrier:'chrome',browser_version:registration.browser_version,executable:registration.executable,viewport:[1366,768],zoom:1,capture:{screenshot_scale:'device',png_ihdr:[1366,768],requested_context:{viewport:{width:1366,height:768},deviceScaleFactor:1}},native_display:native};
 const result=visualCurrentPairDprIdentity(input,registration);assert.equal(result.recognized,true);assert.equal(result.actual_dpr,input.actual);assert.equal(result.target_identity_basis,registration.version);
 for(const invalid of [{...input,actual:1.00000001},{...input,zoom:1.01},{...input,native_display:{...native,windows:[{...native.windows[0],dpi:144}]}},{...input,capture:{...input.capture,png_ihdr:[1367,768]}}])assert.equal(visualCurrentPairDprIdentity(invalid,registration).recognized,false);
 for(const invalid of [{...registration,version:'unknown'},{...registration,registered_at:undefined},{...registration,native_configuration:undefined}])assert.equal(visualCurrentPairDprIdentity(input,invalid).recognized,false);`;
 execFileSync(process.execPath,['--input-type=module','-e',program],{encoding:'utf8',timeout:10000,maxBuffer:1000000});
});

test('B24 E52 report geometry binds the real article and actual ancestor clipping while retaining natural heights',()=>{
 const helper=new URL('../verification/outcome-visual-comparison.mjs',import.meta.url).href;
 const program=`import assert from 'node:assert/strict';import {reportGeometryIdentity} from ${JSON.stringify(helper)};const box=(x,y,width,height)=>({x,y,width,height,left:x,top:y,right:x+width,bottom:y+height});
 const column=box(402,160,1518,740),article=box(661,187,1000,686),input={column,article,expected:article,ancestors:[{overflow_x:'hidden',overflow_y:'hidden',box:column}]};assert.equal(reportGeometryIdentity(input).valid,true);
 for(const wrong of [{...input,article:box(661,187,500,686)},{...input,article:box(671,187,1000,686)},{...input,article:box(661,197,1000,686)},{...input,ancestors:[{overflow_x:'hidden',overflow_y:'hidden',box:box(402,160,500,740)}]}])assert.equal(reportGeometryIdentity(wrong).valid,false);
 const tall=box(661,160,1000,900);assert.equal(reportGeometryIdentity({...input,article:tall,expected:tall}).valid,true);`;
 execFileSync(process.execPath,['--input-type=module','-e',program],{encoding:'utf8',timeout:10000,maxBuffer:1000000});
});

test('B24 E51 formal native evidence requires trusted hidden, a matching Game receipt and explicit-only resume',()=>{
 const helper=new URL('../verification/outcome-native-recovery.mjs',import.meta.url).href;
 const program=`import assert from 'node:assert/strict';import {validateFormalE51Evidence} from ${JSON.stringify(helper)};
 const view={run_id:'owned',sim_time:1200,paused:true},trace=[{request:{request_id:'r1',kind:'management_pause',reason:'application_hidden'}},{response:{request_id:'r1',ok:true,view}}];const evidence={before:{run_id:'owned',sim_time:1000,paused:false},blur:{state:{focused:false},view,native_events:[{kind:'blur',trusted:true,focused:false}],trace},hidden:{state:{hidden:true,visibility:'hidden'},view},native_events:[{kind:'visibilitychange',trusted:true,hidden:true}],trace,restored:{before:view,after:view,state:{hidden:false,visibility:'visible'},native_events:[{kind:'visibilitychange',trusted:true,hidden:false}]},explicit_continue:{run_id:'owned',sim_time:1500,paused:false}};
 assert.equal(validateFormalE51Evidence(evidence),true);
 for(const invalid of [{...evidence,blur:undefined},{...evidence,blur:{...evidence.blur,native_events:[]}},{...evidence,blur:{...evidence.blur,trace:[{request:{request_id:'r1',kind:'management_pause',reason:'manual'}},trace[1]]}},{...evidence,hidden:{...evidence.hidden,state:{hidden:false,visibility:'visible'}}},{...evidence,native_events:[{kind:'visibilitychange',trusted:false,hidden:true}]},{...evidence,trace:[]},{...evidence,restored:{...evidence.restored,state:{hidden:true,visibility:'hidden'}}},{...evidence,restored:{...evidence.restored,native_events:[]}},{...evidence,restored:{...evidence.restored,native_events:[{kind:'visibilitychange',trusted:false,hidden:false}]}},{...evidence,restored:{...evidence.restored,after:{...view,sim_time:1300}}},{...evidence,explicit_continue:{...evidence.explicit_continue,run_id:'other'}},{...evidence,explicit_continue:{...evidence.explicit_continue,paused:true}}])assert.throws(()=>validateFormalE51Evidence(invalid));`;
 execFileSync(process.execPath,['--input-type=module','-e',program],{encoding:'utf8',timeout:10000,maxBuffer:1000000});
});

test('B24 E54 repeated actual debrief reads reuse only a completed replay proof, with a cold Game proving the same packages again',async()=>{
 const store=new Persistence('b24-owned-t04-replay-cost'),producer=new Game(store);
 try{
  const initial=await producer.create_run(definition,'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});
  const issued=await producer.apply_outcome_intent({run_id:initial.run_id,operation_id:'R-to-A',expected_revision:initial.revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity','R-to-A'),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}});
  const final=(await producer.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:issued.view.revision,intent:{kind:'advance',to:910000}})).view,session=await producer.open_outcome_debrief(initial.run_id),saved=await store.read_committed(initial.run_id),sealed=await store.snapshot(initial.run_id,session.finished_seq);
  if(sealed?.schema!==10||!sealed.integrity)throw Error('Actual sealed package required');
  const query={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,as_of_revision:session.finished_seq,actor:'HQ',layer:'known_then',topic:'evidence'},expected=await producer.query_outcome_debrief(query),reader=new Game(store);
  // Observe the real validator, never replace its result. Count by actual
  // package digest so initial and parent packages remain separate proofs.
  const validator=vi.spyOn(Snapshot,'validate_state'),cpu=process.cpuUsage(),started=performance.now(),resources=process.getActiveResourcesInfo();
  try{
   expect(await reader.query_outcome_debrief(query)).toEqual(expected);expect(await reader.query_outcome_debrief(query)).toEqual(expected);
   const counts=new Map<string,number>();for(const [value] of validator.mock.calls){const digest=observedOutcomeDigest(value);if(digest)counts.set(digest,(counts.get(digest)??0)+1);}
   const cost={elapsed_ms:performance.now()-started,cpu_us:process.cpuUsage(cpu),resources_before:resources,resources_after:process.getActiveResourcesInfo(),counts:[...counts],resource_scope:'worker resources, not an inventory of Game-owned handles'};
   fs.writeFileSync(path.join(os.tmpdir(),'b24-owned-replay-cost-'+process.pid+'.json'),JSON.stringify(cost),{flag:'wx'});console.log('B24_ACTUAL_REPLAY_COST '+JSON.stringify(cost));
   expect(counts.get(sealed.integrity)).toBe(1);expect([...counts.values()].every(count=>count===1)).toBe(true);
   const before=validator.mock.calls.length;expect(await new Game(store).query_outcome_debrief(query)).toEqual(expected);expect(validator.mock.calls.length).toBeGreaterThan(before);
   expect(validator.mock.calls.filter(([value])=>observedOutcomeDigest(value)===sealed.integrity)).toHaveLength(2);
   expect(await store.read_committed(initial.run_id)).toEqual(saved);expect(await store.snapshot(initial.run_id,session.finished_seq)).toEqual(sealed);expect(await reader.get_view(initial.run_id)).toEqual(final);
  }finally{validator.mockRestore();}
 }finally{await store.delete();}
});

test('B24 E54 a warm replay proof still hashes actual owned IndexedDB bytes and never remembers a failed self-hashed replay',async()=>{
 const store=new Persistence('b24-owned-t04-replay-damaged-bytes'),database=new Dexie(store.name);
 try{
  const game=new Game(store),view=await game.create_run(definition,'research','create');expect(await game.get_view(view.run_id)).toEqual(view);const saved=await store.read_committed(view.run_id);if(saved?.schema!==10)throw Error('Owned package required');
  await database.open();const damaged=structuredClone(saved);damaged.prefix.source.resources.energy-=1;await database.table('runs').put(damaged);await expect(game.get_view(view.run_id)).rejects.toThrow('INVALID_SAVE');
  damaged.integrity=await Snapshot.state_hash(damaged);await database.table('runs').put(damaged);const validator=vi.spyOn(Snapshot,'validate_state');
  try{await expect(game.get_view(view.run_id)).rejects.toThrow('INVALID_SAVE');await expect(game.get_view(view.run_id)).rejects.toThrow('INVALID_SAVE');expect(validator.mock.calls.filter(([value])=>observedOutcomeDigest(value)===damaged.integrity)).toHaveLength(2);}finally{validator.mockRestore();}
  expect(await store.read_committed(view.run_id)).toEqual(damaged);await database.table('runs').put(saved);expect(await game.get_view(view.run_id)).toEqual(view);expect(await store.snapshot(view.run_id,1)).toEqual(saved);
 }finally{database.close();await store.delete();}
});

test('B24 E54 a warm package proof still loads its actual strict owned definition and schema9 prefix',async()=>{
 const owned=outcome_definition_for_package(definition.definition_hash);owned.catalogs.verification_receipt_delay=10001;owned.hashes.catalogs=await hash(owned.catalogs);const {definition_hash:ignored,...body}=owned;void ignored;owned.definition_hash=await hash(body);
 const store=new Persistence('b24-owned-t04-replay-registry',[],[],[],[owned]);
 try{
  const game=new Game(store),view=await game.create_run(owned,'research','create');expect(await game.get_view(view.run_id)).toEqual(view);const saved=await store.read_committed(view.run_id),registration=store.outcome_definitions[0],prefixHash=registration.prefix_definition.hashes.profile;
  // Mutate only this test-owned registration seam after a genuine warm read.
  registration.prefix_definition.hashes.profile='0'.repeat(64);await expect(game.get_view(view.run_id)).rejects.toThrow('INVALID_SAVE');registration.prefix_definition.hashes.profile=prefixHash;
  expect(await game.get_view(view.run_id)).toEqual(view);expect(await store.read_committed(view.run_id)).toEqual(saved);
 }finally{await store.delete();}
});

test('B24 E54 a warm child still checks the actual initial package and parent readonly marker on every read',async()=>{
 const store=new Persistence('b24-owned-t04-replay-lineage'),database=new Dexie(store.name);
 try{
  const game=new Game(store),parent=await game.create_run(definition,'research','create'),child=await game.restart_run(parent.run_id,'restart');expect(await game.get_view(child.run_id)).toEqual(child);await database.open();
  const key='readonly:'+parent.run_id,marker=await database.table('metadata').get(key);expect(marker).toBeDefined();await database.table('metadata').delete(key);await expect(game.get_view(child.run_id)).rejects.toThrow('INVALID_SAVE');await database.table('metadata').put(marker);expect(await game.get_view(child.run_id)).toEqual(child);
  const snapshotKey=child.run_id+':1',initial=await database.table('snapshots').get(snapshotKey);expect(initial).toBeDefined();const damaged=structuredClone(initial);damaged.state.rng.origin='owned-forged-origin';damaged.state.integrity=await Snapshot.state_hash(damaged.state);await database.table('snapshots').put(damaged);await expect(game.get_view(child.run_id)).rejects.toThrow('INVALID_SAVE');await database.table('snapshots').put(initial);expect(await game.get_view(child.run_id)).toEqual(child);
 }finally{database.close();await store.delete();}
});

test.each(['anchor','template'] as const)('B24 E54 a warm sealed replay proof never bypasses actual %s metadata validation',async kind=>{
 const store=new Persistence('b24-owned-t04-replay-meta-'+kind),database=new Dexie(store.name);
 try{
  const game=new Game(store),initial=await game.create_run(definition,'research','create');await game.control_clock({run_id:initial.run_id,operation_id:'finish',expected_revision:initial.revision,intent:{kind:'advance',to:910000}});const session=await game.open_outcome_debrief(initial.run_id),query={run_id:initial.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,as_of_revision:session.finished_seq,actor:'HQ',layer:'known_then',topic:'evidence'},answer=await game.query_outcome_debrief(query),saved=await store.read_committed(initial.run_id);await database.open();
  const key=(kind==='anchor'?'outcome-debrief-anchor:':'outcome-debrief:')+initial.run_id,row=await database.table('metadata').get(key);expect(row).toBeDefined();const damaged=structuredClone(row);
  if(kind==='anchor')damaged.debrief_anchor.finished_seq+=1;else damaged.debrief_template.agenda=['invented-agenda'];await database.table('metadata').put(damaged);await expect(game.query_outcome_debrief(query)).rejects.toThrow('INVALID_SAVE');await database.table('metadata').put(row);
  expect(await game.query_outcome_debrief(query)).toEqual(answer);expect(await store.read_committed(initial.run_id)).toEqual(saved);
 }finally{database.close();await store.delete();}
});

test('B24 E54 the replay proof cache stays bounded and revalidates an evicted actual package',async()=>{
 const store=new Persistence('b24-owned-t04-replay-eviction'),game=new Game(store),validator=vi.spyOn(Snapshot,'validate_state');
 try{
  const first=await game.create_run(definition,'research','create-0'),saved=await store.read_committed(first.run_id);if(saved?.schema!==10)throw Error('Owned initial required');expect(await game.get_view(first.run_id)).toEqual(first);
  const count=()=>validator.mock.calls.filter(([value])=>observedOutcomeDigest(value)===saved.integrity).length;expect(count()).toBe(1);
  for(let index=1;index<=64;index++){const next=await game.create_run(definition,'research','create-'+index);expect(await game.get_view(next.run_id)).toEqual(next);}
  expect(await game.get_view(first.run_id)).toEqual(first);expect(count()).toBe(2);expect(await store.read_committed(first.run_id)).toEqual(saved);
 }finally{validator.mockRestore();await store.delete();}
});

test('B24 E53/E55 the public CI discovery command retains the complete legacy contract and declares separate Windows obligations',()=>{
 const output=execFileSync(process.execPath,['verification/browser-contract.mjs','--list-only'],{encoding:'utf8',timeout:30000,maxBuffer:8000000,env:{...process.env,FB01_HEADED:'1'}});
 const line=output.split('\n').find(row=>row.startsWith('FB01_BROWSER_MANIFEST '));expect(line).toBeDefined();const manifest=JSON.parse(line!.slice('FB01_BROWSER_MANIFEST '.length));
 expect(manifest).toMatchObject({jobs:1,legacy_count:231,workers:1,retries:0});expect(manifest.full_count).toBeGreaterThan(231);expect(manifest.portable_count+manifest.windows_required_count).toBe(manifest.full_count);expect(manifest.windows_required_count).toBeGreaterThan(0);expect(manifest.tests).toHaveLength(manifest.full_count);expect(new Set(manifest.tests.map((item:{key:string})=>item.key)).size).toBe(manifest.full_count);
 expect(typeof manifest.native_exclusion_pattern).toBe('string');const discovered=execFileSync(process.execPath,['node_modules/@playwright/test/cli.js','test','--list','--reporter=json','--grep-invert',manifest.native_exclusion_pattern],{encoding:'utf8',timeout:15000,maxBuffer:8000000,env:{...process.env,FB01_HEADED:'1',PLAYWRIGHT_JSON_OUTPUT_FILE:'',PLAYWRIGHT_JSON_OUTPUT_NAME:''}}),report=JSON.parse(discovered);expect(report.errors).toEqual([]);
 const actual:string[]=[];function visit(suite:any,parents:string[]){for(const spec of suite.specs??[])for(const test of spec.tests)actual.push(JSON.stringify([spec.file.replaceAll('\\','/'),test.projectId,[...parents,spec.title]]));for(const child of suite.suites??[])visit(child,[...parents,child.title.replaceAll('\\','/')]);}for(const suite of report.suites)visit(suite,[suite.title.replaceAll('\\','/')]);expect(actual.sort()).toEqual(manifest.tests.filter((row:{obligation:string})=>row.obligation==='portable').map((row:{key:string})=>row.key).sort());expect(actual).toHaveLength(manifest.portable_count);
 const diagnostic=path.join(os.tmpdir(),'b24-browser-projection-'+process.pid+'.json');fs.writeFileSync(diagnostic,JSON.stringify({manifest,projected:report}),{flag:'wx'});console.log('B24_BROWSER_PROJECTION_EVIDENCE '+diagnostic);
},35000);

test.each(['manual','focus_lost','application_hidden'] as const)('B24 E51 actual Game management %s pause retains its required reason and confirms the current command clock',async reason=>{
 const store=new Persistence('b24-owned-t04-management-'+reason);
 try{
  const game=new Game(store),initial=await game.create_run(definition,'command','create'),result=await game.control_clock({run_id:initial.run_id,operation_id:'actual-pause',expected_revision:initial.revision,intent:{kind:'pause',reason}},1000);
  expect(result.view).toMatchObject({run_id:initial.run_id,sim_time:1000,paused:true,mode:'command',finished:false,decision_records:[]});expect(result.receipt).toMatchObject({operation_id:'actual-pause',kind:'pause',result:'committed',sim_time:1000});const saved=await store.read_committed(initial.run_id);if(saved?.schema!==10)throw Error('Owned schema10 state absent');expect(saved.inputs.at(-1)?.envelope.intent).toEqual({kind:'pause',reason});expect(saved.prefix.inputs.at(-1)?.envelope.intent).toEqual({kind:'pause',reason});expect(saved.prefix.paused).toBe(true);expect(saved.prefix.sim_time).toBe(1000);
 }finally{await store.delete();}
});

test('B24 E54 evidence serialization crossing the original deadline cannot save a passing local receipt',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'b24-owned-receipt-deadline-'));
 const helper=new URL('../verification/outcome-native-recovery.mjs',import.meta.url).href;
 const program=`import fs from 'node:fs';import {saveLocalReceipt} from ${JSON.stringify(helper)};
 const folder=process.argv[1],deadline=Date.now()+25;
 const plan={artifact_root:folder,receipt:folder+'/receipt.json',deadline_epoch_ms:deadline,selector:'owned-reporter-deadline-unit'};
 const receipt={executed:true,completed:true,passed:true,checks:1,evidence:[]};
 const evidence={toJSON(){while(Date.now()<=deadline+10){}return {kind:'owned-unit-evidence',claim:'No browser/sample slot executed'};}};
 await saveLocalReceipt(plan,receipt,evidence);`;
 let status=0;try{execFileSync(process.execPath,['--input-type=module','-e',program,folder],{encoding:'utf8',timeout:5000});}catch(error){status=(error as {status:number}).status;}
 expect(status).toBe(1);const receipt=JSON.parse(fs.readFileSync(path.join(folder,'receipt.json'),'utf8'));expect(receipt.passed).toBe(false);expect(receipt.failure).toContain('deadline');expect(Date.parse(receipt.finished)).toBeGreaterThanOrEqual(Date.parse(receipt.evidence_saved_at));
});

test('B24 E52 the independent damaged component carrier compiles actual sources without a browser, product service or unshipped local evidence',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'b24-owned-component-compile-'));
 const helper=new URL('../verification/outcome-visual-comparison.mjs',import.meta.url).href;
 const program=`import fs from 'node:fs';import files from 'node:fs/promises';import assert from 'node:assert/strict';import {compileOwnedMissingAttachmentFixture} from ${JSON.stringify(helper)};
 const read=files.readFile;files.readFile=async function(file,...args){if(String(file).includes('e52-missing-attachment-component-prereg'))throw Error('Portable compiler cannot require unshipped local admission evidence');return read.call(this,file,...args);};
 const bundle=await compileOwnedMissingAttachmentFixture(process.argv[1]);
 assert(bundle.manifest.compiled_sources.some(row=>row.path==='src/outcome-debrief.tsx'));
 assert(bundle.manifest.compiled_sources.some(row=>row.path==='src/core/outcome-evidence.ts'));
 assert(bundle.manifest.assets.some(row=>row.path.endsWith('.js'))&&bundle.manifest.assets.some(row=>row.path.endsWith('.css')));
 assert(bundle.assets.get('__owned-fault__/index.html').bytes.toString().includes('独立损坏输入'));
 assert(bundle.manifest.normal_Game_Worker_interception===false);
 fs.writeFileSync(process.argv[1]+'/compile-result.json',JSON.stringify(bundle.manifest),{flag:'wx'});`;
 execFileSync(process.execPath,['--input-type=module','-e',program,folder],{encoding:'utf8',timeout:30000,maxBuffer:3000000});
 expect(JSON.parse(fs.readFileSync(path.join(folder,'compile-result.json'),'utf8')).kind).toBe('independent-damaged-readonly-component-carrier');
},35000);
