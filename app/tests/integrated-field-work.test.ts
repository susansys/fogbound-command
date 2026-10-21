import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import type {IntegratedFieldEnvelope,IntegratedFieldPlayerView} from '../src/integrated-field-contracts';
import {valid_response} from '../src/dto';
const selector={schema:13,contract:'0.5.1',package_ref:{id:'INTEGRATED-FIELD-PACK-3',version:1}};
async function reviewFixture(){
 const store=new Persistence('b33-owned-review-'+crypto.randomUUID()),game=new Game(store);
 let view=await game.create_run(selector,'research',crypto.randomUUID()) as IntegratedFieldPlayerView;
 const apply=async(intent:IntegratedFieldEnvelope['intent'])=>{view=(await game.apply_integrated_intent({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent})).view as IntegratedFieldPlayerView;};
 const advance=(to:number)=>apply({kind:'advance',to});
 const local=async()=>{const state=await store.read_committed(view.run_id);if(state?.schema!==13)throw Error('Expected integrated state');return state;};
 return{store,game,apply,advance,local,get view(){return view;}};
}
test('NB3-AT011 W leaving H consumes the full moving interval independent of tick partition',async()=>{
 const results=[];
 for(const stops of [[651000],[551001,651000]]){
  const f=await reviewFixture();try{
   const model_ref=f.view.model_catalog.model_ref;
   await f.advance(288000);await f.apply({kind:'integrated_move',actor:'W',target:'H',model_ref});await f.advance(550000);
   // H handover now occupies W; measure departure only after its actual completion.
   expect((await f.local()).dag.handovers.find(record=>record.actor==='W')!.completed_at).toBeLessThanOrEqual(550000);
   const before=(await f.local()).work.portable_energy_uJ.W;
   await f.apply({kind:'integrated_move',actor:'W',target:'A',model_ref});for(const to of stops)await f.advance(to);
   const state=await f.local();results.push({energy:state.work.portable_energy_uJ.W-before,position:state.actors.W.position_um});
  }finally{await f.store.delete();}
 }
 expect(results[0]).toEqual(results[1]);expect(results[0]).toEqual({energy:50000000,position:[150000000,150000000]});
});
test('NB3-AT012 every extra activity basis must exist, be delivered and match the action without committing',async()=>{
 const f=await reviewFixture();try{
  const model_ref=f.view.model_catalog.model_ref,plan_ref={run_id:f.view.run_id,id:'B33-PLAN-1',version:1 as const};
  await f.apply({kind:'integrated_move',actor:'R',target:'A',model_ref});await f.advance(102000);
  await f.apply({kind:'integrated_activity',actor:'W',action:'inspect',target:'B',plan_ref,model_ref,basis_refs:[]});
  const inspectOperation=(await f.local()).inputs.at(-1)!.envelope.operation_id;
  await f.advance(133000);
  const before=await f.local();
  for(const id of ['UNKNOWN',inspectOperation+'-completed-delivery','opening-W']){
   const operation_id=crypto.randomUUID(),intent={kind:'integrated_activity' as const,actor:'R' as const,action:'read' as const,target:'A' as const,model_ref,basis_refs:[{run_id:f.view.run_id,id:f.view.actors.find(actor=>actor.id==='R')!.position.evidence,version:1 as const},{run_id:f.view.run_id,id:'opening-A-access',version:1 as const},{run_id:f.view.run_id,id,version:1 as const}]};
   await expect(f.game.apply_integrated_intent({run_id:f.view.run_id,operation_id,expected_revision:f.view.revision,intent})).rejects.toThrow('INVALID_REQUEST');
   expect(await f.local()).toEqual(before);expect(await f.store.receipt(f.view.run_id,operation_id)).toBeUndefined();
  }
 }finally{await f.store.delete();}
});
test('NB3-AT010 a later same-version diagnostic does not revoke a delivered functional witness',async()=>{
 const f=await reviewFixture();try{
  const model_ref=f.view.model_catalog.model_ref,plan_ref={run_id:f.view.run_id,id:'B33-PLAN-1',version:1 as const},ref=(id:string)=>({run_id:f.view.run_id,id,version:1 as const});
  await f.apply({kind:'integrated_prepare',plan_ref,model_ref});await f.apply({kind:'integrated_move',actor:'R',target:'A',model_ref});
  await f.apply({kind:'integrated_activity',actor:'W',action:'inspect',target:'B',plan_ref,model_ref,basis_refs:[]});await f.advance(165000);
  const inspection=f.view.activity_reports.find(report=>report.action==='inspect'&&report.phase==='completed')!;
  await f.apply({kind:'integrated_activity',actor:'W',action:'repair',target:'B',plan_ref,model_ref,basis_refs:[ref(inspection.id),f.view.preparation!.approval_ref!]});await f.advance(287000);
  const functional=f.view.activity_reports.find(report=>report.action==='repair'&&report.phase==='completed')!;
  await f.apply({kind:'integrated_activity',actor:'W',action:'inspect',target:'B',plan_ref,model_ref,basis_refs:[]});await f.advance(300000);
  await f.apply({kind:'integrated_move',actor:'R',target:'B',model_ref});await f.advance(419648);
  expect(f.view.facility_knowledge).toMatchObject({method:'diagnostic',version:3});
  await f.apply({kind:'integrated_activity',actor:'R',action:'read',target:'B',model_ref,basis_refs:[ref(f.view.actors.find(actor=>actor.id==='R')!.position.evidence),ref(functional.id)]});
  await f.advance(465398);expect(f.view.artifacts).toEqual(expect.arrayContaining([expect.objectContaining({source:'B',verified:true})]));
 }finally{await f.store.delete();}
});
test('NB3-AT009 DTO rejects a verified artifact without its completed read report and delivery',async()=>{
 const f=await reviewFixture();try{
  const orphan={...f.view,artifacts:[{id:'orphan',source:'A',logical_size_bytes:1000000000,verified:true,observed_at:0,received_at:0}]};
  expect(valid_response({request_id:'orphan',ok:true,view:orphan})).toBe(false);
 }finally{await f.store.delete();}
});
test('NB3-AT009 actual Game reads one logical GB through four phases before committing a verified artifact',async()=>{
 const store=new Persistence('b33-owned-read-phases-'+crypto.randomUUID()),game=new Game(store);
 try{
  let view=await game.create_run(selector,'research',crypto.randomUUID()) as IntegratedFieldPlayerView;
  const missingRecipe=structuredClone(view);missingRecipe.model_catalog.parameters=missingRecipe.model_catalog.parameters.filter(parameter=>parameter.id!=='P-READ');expect(valid_response({request_id:'missing-read-recipe',ok:true,view:missingRecipe})).toBe(false);
  const apply=async(intent:IntegratedFieldEnvelope['intent'])=>{view=(await game.apply_integrated_intent({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent})).view as IntegratedFieldPlayerView;};
  const advance=(to:number)=>apply({kind:'advance',to});
  const local=async()=>{const state=await store.read_committed(view.run_id);if(state?.schema!==13)throw Error('Expected new state');return state;};
  await apply({kind:'integrated_move',actor:'R',target:'A',model_ref:view.model_catalog.model_ref});await advance(102000);
  const position=view.actors.find(actor=>actor.id==='R')!.position;
  await apply({kind:'integrated_activity',actor:'R',action:'read',target:'A',model_ref:view.model_catalog.model_ref,basis_refs:[{run_id:view.run_id,id:position.evidence,version:1},{run_id:view.run_id,id:'opening-A-access',version:1}]});
  await advance(103000);expect((await local()).work.activities[0]).toMatchObject({started_at:103000,phase:'prepare',copied_bytes:0,verified_bytes:0});
  await advance(123000);expect((await local()).work.activities[0]).toMatchObject({phase:'copy',copied_bytes:0});
  await advance(135500);expect((await local()).work.activities[0]).toMatchObject({phase:'verify',copied_bytes:1000000000,verified_bytes:0});expect((await local()).work.artifacts).toHaveLength(0);
  await advance(141750);expect((await local()).work.activities[0]).toMatchObject({phase:'stow',verified_bytes:1000000000});expect((await local()).work.artifacts).toHaveLength(0);
  await advance(146750);expect((await local()).work.artifacts).toMatchObject([{source:'A',logical_size_bytes:1000000000,verified:true,completed_at:146750}]);expect(view.artifacts).toHaveLength(0);
  await advance(147750);expect(view.artifacts).toMatchObject([{source:'A',logical_size_bytes:1000000000,verified:true,observed_at:146750,received_at:147750}]);
  expect(valid_response({request_id:'actual-artifact',ok:true,view})).toBe(true);
  for(const mutation of ['missing-report','wrong-source','wrong-report','wrong-delivery','wrong-artifact','wrong-time','duplicate-delivery','duplicate-report']){
   const broken=structuredClone(view),artifact=broken.artifacts[0];
   if(mutation==='missing-report')broken.activity_reports=[];
   if(mutation==='wrong-source')artifact.source='B';
   if(mutation==='wrong-report')artifact.report_ref='UNKNOWN';
   if(mutation==='wrong-delivery')artifact.delivery_ref='UNKNOWN';
   if(mutation==='wrong-artifact')artifact.id='UNKNOWN';
   if(mutation==='wrong-time')artifact.observed_at--;
   if(mutation==='duplicate-delivery')broken.artifacts.push({...artifact,id:'second-artifact'});
   if(mutation==='duplicate-report'){
    const report=broken.activity_reports.find(report=>report.id===artifact.delivery_ref)!;
    broken.activity_reports.push({...report,id:'second-delivery',artifact_ref:'second-artifact'});
    broken.artifacts.push({...artifact,id:'second-artifact',delivery_ref:'second-delivery'});
   }
   expect(valid_response({request_id:mutation,ok:true,view:broken})).toBe(false);
  }
  expect((await local()).work.fixed_source_energy_uJ.A).toBe(218750000);expect((await local()).work.portable_energy_uJ.R).toBe(645500000);expect((await local()).work.storage_free_bytes.R).toBe(15000000000);
 }finally{await store.delete();}
});

test('NB3-AT011 actual modes integrate nominal portable microjoules and independent fixed-source energy',async()=>{
 const store=new Persistence('b33-owned-mode-energy-'+crypto.randomUUID()),game=new Game(store);
 try{
  let view=await game.create_run(selector,'research',crypto.randomUUID()) as IntegratedFieldPlayerView;
  const apply=async(intent:IntegratedFieldEnvelope['intent'])=>{view=(await game.apply_integrated_intent({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent})).view as IntegratedFieldPlayerView;};
  const advance=(to:number)=>apply({kind:'advance',to}),model_ref=view.model_catalog.model_ref,plan_ref={run_id:view.run_id,id:'B33-PLAN-1',version:1 as const};
  await apply({kind:'integrated_prepare',plan_ref,model_ref});await apply({kind:'integrated_activity',actor:'W',action:'inspect',target:'B',plan_ref,model_ref,basis_refs:[]});
  await advance(165000);await apply({kind:'integrated_move',actor:'R',target:'A',model_ref});
  const inspection=view.activity_reports.find(report=>report.action==='inspect'&&report.phase==='completed')!;
  await apply({kind:'integrated_activity',actor:'W',action:'repair',target:'B',plan_ref,model_ref,basis_refs:[{run_id:view.run_id,id:inspection.id,version:1},view.preparation!.approval_ref!]});
  await advance(267000);await apply({kind:'integrated_activity',actor:'R',action:'observe',target:'A',model_ref,basis_refs:[{run_id:view.run_id,id:view.actors.find(actor=>actor.id==='R')!.position.evidence,version:1}]});
  await advance(288000);await apply({kind:'integrated_move',actor:'W',target:'H',model_ref});
  const read=async(target:'A'|'B')=>apply({kind:'integrated_activity',actor:'R',action:'read',target,model_ref,basis_refs:[{run_id:view.run_id,id:view.actors.find(actor=>actor.id==='R')!.position.evidence,version:1},{run_id:view.run_id,id:target==='A'?'opening-A-access':view.facility_knowledge!.evidence,version:1}]});
  await advance(289000);await read('A');await advance(334750);await apply({kind:'integrated_move',actor:'R',target:'B',model_ref});
  await advance(454398);await read('B');await advance(500148);await apply({kind:'integrated_move',actor:'R',target:'H',model_ref});await advance(765796);
  const state=await store.read_committed(view.run_id);if(state?.schema!==13)throw Error('Expected new state');
  expect(state.work.portable_energy_uJ).toEqual({R:2271592000,W:1439294500});expect(state.work.fixed_source_energy_uJ).toEqual({A:218750000,B:218750000});expect(state.work.storage_free_bytes.R).toBe(14000000000);
  expect(view.artifacts.map(artifact=>artifact.source)).toEqual(['A','B']);expect(state.actors.R.position_um).toEqual([50000000,150000000]);expect(state.actors.W.position_um).toEqual([50000000,150000000]);
  // This verifies the process and power ledger; H/INTEL handover and mission completion remain S11.
 }finally{await store.delete();}
});

test('NB3-AT012 missing parts, occupied work and unsupported suspension preserve spent resources',async()=>{
 for(const initial_spares of [0,1] as const){const store=new Persistence('b33-owned-work-refusal-'+crypto.randomUUID()),game=new Game(store,{integrated_spares:initial_spares});
 try{
  let view=await game.create_run(selector,'command',crypto.randomUUID()) as IntegratedFieldPlayerView;
  const apply=async(intent:IntegratedFieldEnvelope['intent'])=>{view=(await game.apply_integrated_intent({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent})).view as IntegratedFieldPlayerView;};
  const tick=async(to:number)=>{view=(await game.tick(view.run_id,to,crypto.randomUUID())).view as IntegratedFieldPlayerView;};
  const local=async()=>{const state=await store.read_committed(view.run_id);if(state?.schema!==13)throw Error('Expected new state');return state;};
  const model_ref=view.model_catalog.model_ref,plan_ref={run_id:view.run_id,id:'B33-PLAN-1',version:1 as const};
  await apply({kind:'integrated_prepare',plan_ref,model_ref});await apply({kind:'integrated_activity',actor:'W',action:'inspect',target:'B',plan_ref,model_ref,basis_refs:[]});await tick(165000);
  if(initial_spares)await apply({kind:'integrated_move',actor:'R',target:'A',model_ref});
  const inspection=view.activity_reports.find(report=>report.action==='inspect'&&report.phase==='completed')!;
  await apply({kind:'integrated_activity',actor:'W',action:'repair',target:'B',plan_ref,model_ref,basis_refs:[{run_id:view.run_id,id:inspection.id,version:1},view.preparation!.approval_ref!]});
  if(!initial_spares){await tick(168000);expect(view.activity_reports).toEqual(expect.arrayContaining([expect.objectContaining({actor:'W',action:'repair',phase:'refused',reason:'missing_part'})]));expect((await local()).work.inventory).toMatchObject({available_spares:0,reserved_spares:0,installed_new:0,recovered_old:0});continue;}
  await tick(200000);const before=await local();expect(before.work.activities.find(activity=>activity.action==='repair')?.phase).toBe('replace');expect(before.work.portable_energy_uJ.W).toBeGreaterThan(0);
  await expect(game.apply_integrated_intent({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'integrated_suspend'}} as unknown as IntegratedFieldEnvelope)).rejects.toThrow('INVALID_INPUT');
  expect((await local()).work).toEqual(before.work);
  await apply({kind:'pause',reason:'manual'});expect((await local()).work.inventory).toEqual(before.work.inventory);expect((await local()).work.portable_energy_uJ).toEqual(before.work.portable_energy_uJ);await expect(tick(201000)).rejects.toThrow('CLOCK_PAUSED');
  await apply({kind:'continue'});await tick(267000);
  const read=()=>({kind:'integrated_activity' as const,actor:'R' as const,action:'read' as const,target:'A' as const,model_ref,basis_refs:[{run_id:view.run_id,id:view.actors.find(actor=>actor.id==='R')!.position.evidence,version:1 as const},{run_id:view.run_id,id:'opening-A-access',version:1 as const}]});
  await apply(read());await apply(read());await tick(270000);
  expect(view.activity_reports).toEqual(expect.arrayContaining([expect.objectContaining({actor:'R',action:'read',phase:'refused',reason:'station_busy'})]));expect((await local()).work.activities.filter(activity=>activity.action==='read')).toHaveLength(1);expect((await local()).work.fixed_source_energy_uJ.A).toBe(10000000);
 }finally{await store.delete();}}
});

test('NB3-AT010 actual same-plan preparation, HQ FIFO and integer installation precede functional confirmation',async()=>{
 const store=new Persistence('b33-owned-repair-phases-'+crypto.randomUUID()),game=new Game(store);
 try{
  let view=await game.create_run(selector,'research',crypto.randomUUID()) as IntegratedFieldPlayerView;
  const apply=async(intent:IntegratedFieldEnvelope['intent'])=>{view=(await game.apply_integrated_intent({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent})).view as IntegratedFieldPlayerView;};
  const advance=(to:number)=>apply({kind:'advance',to});
  const local=async()=>{const state=await store.read_committed(view.run_id);if(state?.schema!==13)throw Error('Expected new state');return state;};
  const plan_ref={run_id:view.run_id,id:'B33-PLAN-1',version:1 as const};
  await apply({kind:'integrated_prepare',plan_ref,model_ref:view.model_catalog.model_ref});
  await apply({kind:'integrated_activity',actor:'W',action:'inspect',target:'B',plan_ref,model_ref:view.model_catalog.model_ref,basis_refs:[]});
  await advance(31000);expect(view.facility_knowledge).toBeNull();
  await advance(32000);expect(view.facility_knowledge).toMatchObject({condition:'faulted',version:1,observed_at:31000,received_at:32000});
  await advance(164999);expect(view.preparation).toMatchObject({status:'preparing'});
  const inspection=view.activity_reports.find(report=>report.action==='inspect'&&report.phase==='completed')!;
  const repair=()=>({kind:'integrated_activity' as const,actor:'W' as const,action:'repair' as const,target:'B' as const,plan_ref,model_ref:view.model_catalog.model_ref,basis_refs:[{run_id:view.run_id,id:inspection.id,version:1 as const},{run_id:view.run_id,id:'B33-PLAN-1-preparation-approval',version:1 as const}]});
  await expect(apply(repair())).rejects.toThrow('EVIDENCE_REQUIRED');
  await advance(165000);expect(view.preparation).toMatchObject({status:'approved',approved_at:165000});
  await apply({kind:'integrated_move',actor:'R',target:'A',model_ref:view.model_catalog.model_ref});await apply(repair());
  await advance(167000);expect((await local()).work.activities.find(activity=>activity.action==='repair')).toMatchObject({started_at:167000,phase:'isolate'});
  await advance(246999);expect((await local()).work.inventory).toMatchObject({available_spares:0,reserved_spares:1,installed_new:0,recovered_old:0});
  await advance(247000);expect((await local()).work.inventory).toMatchObject({available_spares:0,reserved_spares:0,installed_new:1,recovered_old:1});expect((await local()).work.facility).toMatchObject({condition:'unverified_after_replacement',version:2});expect(view.facility_knowledge).toMatchObject({condition:'faulted',version:1});
  await game.save({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'save'}});view=(await game.restore(view.run_id,crypto.randomUUID())).view as IntegratedFieldPlayerView;
  expect(view).toMatchObject({sim_time:247000,paused:true});expect((await local()).work.activities.find(activity=>activity.action==='repair')).toMatchObject({phase:'functional_verify',phase_ends_at:287000});expect((await local()).work.inventory).toMatchObject({installed_new:1,recovered_old:1});
  await advance(287000);expect((await local()).work.facility).toMatchObject({condition:'operable',version:3});expect(view.facility_knowledge).toMatchObject({condition:'faulted',version:1});
  await advance(288000);expect(view.facility_knowledge).toMatchObject({condition:'operable',version:3,observed_at:287000,received_at:288000});
 }finally{await store.delete();}
});
