import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {hash} from '../src/core/scenario';
import outcome from '../src/core/outcome-definition.json';
import source from '../src/core/source-time-definition.json';
import {conflicting_field_definition,conflicting_task_definition,conflicting_action_definition} from '../src/core/conflicting-action-definition';
import {validate_state} from '../src/core/snapshot';

// Author the complete closed package before its loader exists. This first RED
// reaches the existing public Game, not a missing future implementation import.
async function actionPackage(){
 const source_ref='B32-CONFLICTING-ACTION-DESIGN-1.0.0/scenario-and-oracles';
 const parameters={inspection_setup_ms:5000,inspection_work_ms:10000,inspection_energy:2,inspection_wear:1,inspection_packs:0,assessment_versions:32,assessment_reason_chars:1000,assessment_basis_budget:8};
 const profile={id:'FIC-B32-CONFLICTING-ACTION-01',version:1,source_ref,parameters,registry:Object.entries(parameters).map(([id,value])=>({id,value,unit:id.endsWith('_ms')?'ms':id.includes('chars')?'character':'count',entry_version:1,source_ref,source_type:'design_assumption',calibration_status:'uncalibrated'}))};
 const profileHash=await hash(profile),field=structuredClone(outcome.prefix_definition);
 field.id='B32-CONFLICTING-FIELD-01';field.version=1;field.profile.id='FIC-B32-FIELD-01';
 Object.assign(field.rules,{version:'b32-conflicting-field-1',inspection_profile_ref:profile.id,inspection_profile_hash:profileHash});
 field.capabilities.push({id:'W:inspect',actor:'W',action:'inspect',qualification:'work_keeper',equipment:'WORK',unit:'work',capacity:1});
 field.catalogs.activities.splice(3,0,{id:'W-inspect',actor:'W',action:'inspect',from:'B',to:'B',capability:'W:inspect',prerequisite:null,conditions:[],label:'W检查B'});
 field.catalogs.activities.find(a=>a.id==='B-record')!.conditions=['verified_access','facility_evidence'];
 field.catalogs.initial_known.B_repair='unknown';
 for(const key of ['profile','capabilities','rules','catalogs'] as const)field.hashes[key]=await hash(field[key]);
 const {definition_hash:ignoredFieldHash,...fieldBody}=field;void ignoredFieldHash;field.definition_hash=await hash(fieldBody);
 const task=structuredClone(outcome);task.id='B32-CONFLICTING-TASK-01';task.version=1;task.profile.id='FIC-B32-TASK-01';task.prefix_definition=field;
 Object.assign(task.rules,{version:'b32-conflicting-task-1',inspection_profile_ref:profile.id,inspection_profile_hash:profileHash});
 task.capabilities.push({id:'W:inspect',actor:'W',action:'inspect',qualification:'work_keeper',equipment:'WORK',unit:'work',capacity:1});task.catalogs.activities=structuredClone(field.catalogs.activities);task.catalogs.initial_known=structuredClone(field.catalogs.initial_known);
 for(const key of ['profile','capabilities','rules','catalogs'] as const)task.hashes[key]=await hash(task[key]);
 const {definition_hash:ignoredTaskHash,...taskBody}=task;void ignoredTaskHash;task.definition_hash=await hash(taskBody);
 const catalogs={reports:[
  {id:'FC1',version:1,target:'B',source:'B点设施档案',claim:'operable',text:'B点设施记录称目前可用，仍需核对',event_time:{kind:'unknown'},observed:10000,source_reported:15000},
  {id:'FC2',version:1,target:'B',source:'B点设施档案',claim:'faulted',text:'B点设施记录称需要维修，仍需核对',event_time:{kind:'unknown'},observed:10000,source_reported:17000}
 ],messages:[
  {id:'D-FC1',report:'FC1',sender:'FacilityArchive',recipient:'HQ',sent:19000,received:20000},
  {id:'D-FC2',report:'FC2',sender:'FacilityArchive',recipient:'HQ',sent:21000,received:22000}
 ]};
 const rules={version:'B32-CONFLICTING-ACTION-1.0.0',source_ref:'B32-CONFLICTING-ACTION-DESIGN-1.0.0/contract',target:'B',inspection_activity:'W-inspect',record_facility_gate:'delivered_operable_inspection_or_repair',retain_legacy_record_gates:true,facility_initial_version:1};
 const body={schema:12,scenario_kind:'play_conflicting_action',contract:'0.5.1',id:'B32-CONFLICTING-ACTION-01',version:1,task_definition_hash:task.definition_hash,field_definition_hash:field.definition_hash,task_hashes:task.hashes,field_hashes:field.hashes,source_definition_hash:source.definition_hash,profile,catalogs,rules,hashes:{task:task.definition_hash,field:field.definition_hash,source:source.definition_hash,profile:profileHash,catalogs:await hash(catalogs),rules:await hash(rules)}};
 return {...body,definition_hash:await hash(body)};
}

test('B32 E01 public Game selects the independent package and delivers both original claims only at their actual receipt times',async()=>{
 const store=new Persistence('b32-owned-first-public-'+crypto.randomUUID());
 try{
  const game=new Game(store);let view=await game.create_run(await actionPackage(),'research','b32-first-create');
  expect(view).toMatchObject({sim_time:0,conflicting_action:{package:{id:'B32-CONFLICTING-ACTION-01',version:1},reports:[],deliveries:[],assessments:[]}});
  expect(view).toMatchObject({repair_condition:{site:'B',status:'unknown',confirmed_at:null,evidence_ref:null}});
  const state=await store.read_committed(view.run_id);
  expect(state).toMatchObject({schema:12,scenario_kind:'play_conflicting_action',task:{schema:10}});
  if(state?.schema!==12)throw Error('Expected the registered new package');expect(state.task.definition_hash).not.toBe(outcome.definition_hash);expect(state.task.prefix.definition_hash).not.toBe(outcome.prefix_definition.definition_hash);
  for(const [to,ids]of [[19999,[]],[20000,['FC1']],[21999,['FC1']],[22000,['FC1','FC2']]] as const){
   view=(await game.control_clock({run_id:view.run_id,operation_id:'b32-to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;
   expect(Reflect.get(view,'conflicting_action').reports.map((r:{ref:{id:string}})=>r.ref.id)).toEqual(ids);
  }
  expect(view).toMatchObject({conflicting_action:{reports:[
   {ref:{id:'FC1'},claim:'operable',text:'B点设施记录称目前可用，仍需核对',event_time:{kind:'unknown'},observed_time:{kind:'known',value:10000},source_reported_time:{kind:'known',value:15000},verification:'unverified'},
   {ref:{id:'FC2'},claim:'faulted',text:'B点设施记录称需要维修，仍需核对',event_time:{kind:'unknown'},observed_time:{kind:'known',value:10000},source_reported_time:{kind:'known',value:17000},verification:'unverified'}
  ],deliveries:[{sent:19000,received:20000},{sent:21000,received:22000}],independence:{kind:'unknown'}}});
 }finally{await store.delete();}
});

test('B32 E06 internal task identities cannot be selected as legacy runs and damaged wrapper snapshots remain rejected',async()=>{
 const store=new Persistence('b32-owned-closed-identities-'+crypto.randomUUID()),game=new Game(store);
 try{
  for(const internal of [conflicting_field_definition(),conflicting_task_definition()])await expect(game.create_run(internal,'research','wrong-standalone-'+internal.schema)).rejects.toMatchObject({code:'INVALID_DEFINITION'});
  const view=await game.create_run(conflicting_action_definition,'research','valid-wrapper'),state=await store.read_committed(view.run_id);if(state?.schema!==12)throw Error('Expected the new package');
  await expect(validate_state(state.task)).rejects.toMatchObject({code:'INVALID_SAVE'});
  for(const broken of [{...state,definition_hash:outcome.definition_hash},{...state,facility:{...state.facility,current:'operable'}},{...state,hashes:{...state.hashes,task:outcome.definition_hash}}])await expect(validate_state(broken)).rejects.toMatchObject({code:'INVALID_SAVE'});
  expect(await game.get_view(view.run_id)).toEqual(view);
 }finally{await store.delete();}
});

test('B32 E02/E03 working assessments preserve both explanations and version history without changing the actual task',async()=>{
 const store=new Persistence('b32-owned-assessment-'+crypto.randomUUID());
 try{
  const game=new Game(store);let view=await game.create_run(await actionPackage(),'research','create');
  view=(await game.control_clock({run_id:view.run_id,operation_id:'to-claims',expected_revision:view.revision,intent:{kind:'advance',to:22000}})).view;
  const before=view,local=await game.get_actor_view(view.run_id,'W');
  const basis={run_id:view.run_id,kind:'facility_report',id:'FC1',version:1};
  view=(await game.apply_outcome_intent({run_id:view.run_id,operation_id:'assessment-one',expected_revision:view.revision,intent:{kind:'save_working_assessment',base_ref:null,draft:{target_scope:'B',explanations:['operable','faulted'],preferred:'operable',basis_refs:[basis]}}})).view;
  const first=Reflect.get(view,'conflicting_action').assessments[0];
  expect(first).toMatchObject({ref:{kind:'working_assessment',version:1},target_scope:'B',explanations:['operable','faulted'],preferred:'operable',basis_refs:[basis],supersedes:null,recorded_at:22000});
  const committed=await store.read_committed(view.run_id);if(committed?.schema!==12)throw Error('Expected the new package');expect(committed.task.revision).toBe(view.revision);
  expect(view.replay_nodes.at(-1)).toMatchObject({revision:view.revision,at:22000});
  expect(first).not.toHaveProperty('reason');expect(await game.get_actor_view(view.run_id,'W')).toEqual(local);
  expect(Reflect.get(view,'decision_records')).toEqual(Reflect.get(before,'decision_records'));
  view=(await game.apply_outcome_intent({run_id:view.run_id,operation_id:'assessment-two',expected_revision:view.revision,intent:{kind:'save_working_assessment',base_ref:first.ref,draft:{target_scope:'B',explanations:['operable','faulted'],preferred:'undecided',basis_refs:[basis]}}})).view;
  expect(Reflect.get(view,'conflicting_action').assessments).toMatchObject([first,{ref:{version:2},preferred:'undecided',supersedes:first.ref}]);
  expect(await game.get_actor_view(view.run_id,'W')).toEqual(local);
  const history=await game.get_replay(view.run_id,22000,before.revision);
  expect(Reflect.get(await history.get_view(view.run_id),'conflicting_action').assessments).toEqual([]);
 }finally{await store.delete();}
});

test('B32 E04 malformed or unavailable assessment evidence is rejected atomically before any version is saved',async()=>{
 const store=new Persistence('b32-owned-atomic-reject-'+crypto.randomUUID());
 try{
  const game=new Game(store);let view=await game.create_run(await actionPackage(),'research','create');
  view=(await game.control_clock({run_id:view.run_id,operation_id:'to-claims',expected_revision:view.revision,intent:{kind:'advance',to:20000}})).view;
  const basis={run_id:view.run_id,kind:'facility_report',id:'FC1',version:1},draft={target_scope:'B',explanations:['operable','faulted'],preferred:'operable',basis_refs:[basis]};
  const invalid=[{...draft,explanations:Object.assign(['operable','faulted'],{extra:'hidden-data'})},{...draft,reason:undefined},{...draft,preferred:undefined},{...draft,basis_refs:Array(1)},{...draft,basis_refs:[{...basis,run_id:'another-run'}]},{...draft,basis_refs:[{...basis,version:2}]},{...draft,basis_refs:[{...basis,id:'FC2'}]},{...draft,target_scope:'A'},{...draft,basis_refs:[{...basis,kind:'source_report'}]},{...draft,reason:'x'.repeat(1001)}];
  for(const [index,change]of invalid.entries()){
   await expect(game.apply_outcome_intent({run_id:view.run_id,operation_id:'bad-'+index,expected_revision:view.revision,intent:{kind:'save_working_assessment',base_ref:null,draft:change}})).rejects.toMatchObject({code:'INVALID_REQUEST'});
   expect(await game.get_view(view.run_id)).toEqual(view);
   expect(await store.receipt(view.run_id,'bad-'+index)).toBeUndefined();
  }
 }finally{await store.delete();}
});

test('B32 E05/E06 an assessment operation commits once and restores the same paused run without repeating its judgment',async()=>{
 const store=new Persistence('b32-owned-idempotent-restore-'+crypto.randomUUID());
 try{
  const game=new Game(store);let view=await game.create_run(await actionPackage(),'command','create');
  view=(await game.tick(view.run_id,22000,'tick-to-claims')).view;
  const request={run_id:view.run_id,operation_id:'same-assessment',expected_revision:view.revision,intent:{kind:'save_working_assessment',base_ref:null,draft:{target_scope:'B',explanations:['operable','faulted'],preferred:'faulted',basis_refs:[{run_id:view.run_id,kind:'facility_report',id:'FC1',version:1}]}}};
  const original=JSON.stringify(request),saved=await game.apply_outcome_intent(request),replayed=await game.apply_outcome_intent(request);
  expect(replayed.receipt).toEqual(saved.receipt);expect(replayed.view).toEqual(saved.view);expect(JSON.stringify(request)).toBe(original);
  await expect(game.apply_outcome_intent({...request,intent:{...request.intent,draft:{...request.intent.draft,preferred:'operable'}}})).rejects.toMatchObject({code:'OPERATION_ID_REUSED'});
  await expect(game.apply_outcome_intent({...request,operation_id:'stale-new-id'})).rejects.toMatchObject({code:'STALE_REVISION'});
  expect(await store.receipt(view.run_id,'stale-new-id')).toBeUndefined();expect(await game.get_view(view.run_id)).toEqual(saved.view);
  const reopened=new Game(store),restored=await reopened.restore(view.run_id,'restore-once');
  expect(restored.view).toMatchObject({run_id:view.run_id,sim_time:22000,paused:true,conflicting_action:Reflect.get(saved.view,'conflicting_action')});
  expect(restored.receipt).toMatchObject({kind:'restore',snapshot_revision:saved.view.revision});
  expect((await reopened.restore(view.run_id,'restore-once')).receipt).toEqual(restored.receipt);
  const resumed=await reopened.control_clock({run_id:view.run_id,operation_id:'explicit-continue',expected_revision:restored.view.revision,intent:{kind:'continue'}});
  expect(resumed.view).toMatchObject({sim_time:22000,paused:false,conflicting_action:Reflect.get(saved.view,'conflicting_action')});
 }finally{await store.delete();}
});

test('B32 E01 opposite actual private facility states have identical public claims, choices, errors and assessments',async()=>{
 const stores=['operable','faulted'].map(condition=>new Persistence('b32-owned-paired-'+condition+'-'+crypto.randomUUID()));
 try{
  const observations=[];
  for(const [index,condition]of (['operable','faulted'] as const).entries()){
   const store=stores[index],game=new Game(store,{conflicting_facility:condition});let view=await game.create_run(await actionPackage(),'research','same-create');const rows=[];
   const publicCopy=(value:unknown)=>JSON.parse(JSON.stringify(value).replaceAll(view.run_id,'PAIRED-RUN'));
   rows.push(publicCopy(view));
   for(const to of [19999,20000,22000]){view=(await game.control_clock({run_id:view.run_id,operation_id:'same-to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;rows.push(publicCopy(view));}
   await expect(game.apply_outcome_intent({run_id:view.run_id,operation_id:'same-bad',expected_revision:view.revision,intent:{kind:'save_working_assessment',base_ref:null,draft:{target_scope:'A',explanations:['operable','faulted'],basis_refs:[]}}})).rejects.toMatchObject({code:'INVALID_REQUEST'});
   view=(await game.apply_outcome_intent({run_id:view.run_id,operation_id:'same-judgment',expected_revision:view.revision,intent:{kind:'save_working_assessment',base_ref:null,draft:{target_scope:'B',explanations:['operable','faulted'],preferred:'operable',basis_refs:[{run_id:view.run_id,kind:'facility_report',id:'FC1',version:1}]}}})).view;
   rows.push(publicCopy(view));rows.push(publicCopy(await store.list_runs()));
   const actual=await store.read_committed(view.run_id);if(actual?.schema!==12)throw Error('Expected the actual owned private-world fixture');
   expect(actual.facility.current).toBe(condition);observations.push(rows);
  }
  expect(observations[0]).toEqual(observations[1]);
 }finally{for(const store of stores)await store.delete();}
});

test('B32 E03/E05 the bounded assessment history keeps 32 versions and rejects a new version without a partial commit',async()=>{
 const store=new Persistence('b32-owned-version-limit-'+crypto.randomUUID());
 try{
  const game=new Game(store);let view=await game.create_run(await actionPackage(),'research','create'),base_ref=null;
  for(let version=1;version<=32;version++){
   view=(await game.apply_outcome_intent({run_id:view.run_id,operation_id:'assessment-'+version,expected_revision:view.revision,intent:{kind:'save_working_assessment',base_ref,draft:{target_scope:'B',explanations:['operable','faulted'],basis_refs:[],...(version===1?{reason:''}:{})}}})).view;
   base_ref=Reflect.get(view,'conflicting_action').assessments.at(-1).ref;
   expect(base_ref).toMatchObject({version});
  }
  const entries=Reflect.get(view,'conflicting_action').assessments;expect(entries).toHaveLength(32);expect(entries[0]).toMatchObject({reason:'',preferred:'undecided',supersedes:null});expect(entries[1]).not.toHaveProperty('reason');expect(entries[31].supersedes.version).toBe(31);
  await expect(game.apply_outcome_intent({run_id:view.run_id,operation_id:'over-budget',expected_revision:view.revision,intent:{kind:'save_working_assessment',base_ref,draft:{target_scope:'B',explanations:['operable','faulted'],basis_refs:[]}}})).rejects.toMatchObject({code:'CONSTRAINT_DENIED'});
  expect(await game.get_view(view.run_id)).toEqual(view);expect(await store.receipt(view.run_id,'over-budget')).toBeUndefined();
 }finally{await store.delete();}
});
