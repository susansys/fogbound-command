import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import outcome from '../src/core/outcome-definition.json';
import {hash} from '../src/core/scenario';
import {state_hash} from '../src/core/snapshot';
import {valid_response} from '../src/dto';
import type {OutcomePlayerView,OutcomeEnvelope} from '../src/outcome-contracts';
import type {GamePlayerView} from '../src/play-contracts';
import Dexie from 'dexie';
import type {SourceTimeDefinition} from '../src/core/source-time-definition';

// A complete package is authored before its loader exists. This RED exercises
// the real existing Game entry, rather than a missing future module import.
async function sourcePackage(){
 const unknown={kind:'unknown'},known=(value:number,basis_ref:string)=>({kind:'known',value,basis_ref});
 const reports=['M1','M2','M3'].map(id=>({id,version:1,kind:'context_note',subject:'B访问凭证档案说明',text:'档案说明称：B处访问凭证为蓝色；内容尚未核实。',source:'ArchiveSource',event_time:id==='M3'?known(10000,'M3-visible-event-record'):unknown,observed_time:id==='M2'?unknown:known(10000,id+'-visible-observation-metadata'),source_reported_time:id==='M2'?unknown:known(20000,id+'-visible-original-report-metadata')}));
 const evidence=[
  {id:'C12',version:1,issuer:'ArchiveSource',authority:'source_metadata',kind:'confirmed_forward_claim',from:'M2',to:'M1',relation_id:'L12',basis:'C12-visible-archive-transfer-index',claim:'档案转交索引明确将M2标为M1的转述；当前据此归组'},
  {id:'C13',version:1,issuer:'ArchiveSource',authority:'source_metadata',kind:'explicit_independent_acquisition_evidence',covered_reports:['M1','M3'],visible_acquisition_records:['C13-registered-collection-A','C13-registered-collection-C'],basis:'C13-visible-distinct-acquisition-credential',claim:'该两份档案的不同采集凭证及无转引声明已递交；不是因署名或文本不同而推断'},
  {id:'X12',version:1,issuer:'ArchiveSource',authority:'source_metadata',kind:'lineage_retraction',target_relation:'L12',target_basis:'C12',basis:'X12-visible-index-key-correction',reason:'原转交索引把M2指向M1的复制键登记错误；只撤销这条关联，未证明M2独立'}
 ];
 const time_bases=[{"id":"M1-visible-observation-metadata","report":"M1","kind":"observation","value":10000,"description":"M1随附的观察记录"},{"id":"M1-visible-original-report-metadata","report":"M1","kind":"source_reported","value":20000,"description":"M1随附的原始报告记录"},{"id":"M3-visible-event-record","report":"M3","kind":"event","value":10000,"description":"M3随附的事件记录"},{"id":"M3-visible-observation-metadata","report":"M3","kind":"observation","value":10000,"description":"M3随附的观察记录"},{"id":"M3-visible-original-report-metadata","report":"M3","kind":"source_reported","value":20000,"description":"M3随附的原始报告记录"}];
 const catalogs={reports,evidence,time_bases,messages:['M1','M2','M3','C12','C13','X12'].map((id,index)=>({id:'D-'+id,report:id,sender:'ArchiveSource',recipient:'HQ',sent:[44000,54000,64000,74000,94000,114000][index],received:[45000,55000,65000,75000,95000,115000][index]})),private_lineage:['private-A','private-A','private-C']};
 const profile={id:'FIC-B31-SOURCE-TIME-01',version:1,source_ref:'B31-SOURCE-TIME-DESIGN-1.0.0/scenario-timeline',parameters:{extra_messages:6},registry:[{id:'extra_messages',value:6,unit:'message',entry_version:1,source_ref:'B31-SOURCE-TIME-DESIGN-1.0.0/scenario-timeline',source_type:'design_assumption',calibration_status:'uncalibrated'}]};
 const rules={version:'B31-SOURCE-TIME-1.0.0',source_ref:'B31-SOURCE-TIME-DESIGN-1.0.0/data-contract',metadata_issuer:'ArchiveSource',metadata_authority:'source_metadata'};
 const body={schema:11,scenario_kind:'play_source_time',contract:'0.5.1',id:'B31-SOURCE-TIME-01',version:1,task_definition:structuredClone(outcome),profile,catalogs,rules,hashes:{task:outcome.definition_hash,profile:await hash(profile),catalogs:await hash(catalogs),rules:await hash(rules)}};
 return {...body,definition_hash:await hash(body)};
}

test('B31 E01 an explicitly selected source package starts through the existing Game and preserves the original task',async()=>{
 const store=new Persistence('b31-owned-create-'+crypto.randomUUID()),game=new Game(store);
 try{
  const definition=await sourcePackage();
  const view=await game.create_run(definition,'research','b31-create');
  expect(view).toMatchObject({scenario_kind:'play_outcome',sim_time:0,source_package:{id:'B31-SOURCE-TIME-01',version:1},source_reading:{reports:[],deliveries:[]}});
  const state=await store.read_committed(view.run_id);
  expect(state).toMatchObject({schema:11,task:{schema:10,definition_hash:outcome.definition_hash}});
 }finally{await store.delete();}
});

test('B31 E02/E03 delivered originals preserve three distinct identities and unknown source times',async()=>{
 const store=new Persistence('b31-owned-source-times-'+crypto.randomUUID()),game=new Game(store);
 try{
  let view=await game.create_run(await sourcePackage(),'research','create');
  for(const to of [44999,45000,55000,65000]){
   view=(await game.control_clock({run_id:view.run_id,operation_id:'to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;
   if(!('source_reading' in view))throw Error('source projection missing');
   expect(view.source_reading.reports.map(report=>report.ref.id)).toEqual(to<45000?[]:to<55000?['M1']:to<65000?['M1','M2']:['M1','M2','M3']);
  }
  if(!('source_reading' in view))throw Error('source projection missing');
  expect(new Set(view.source_reading.reports.map(report=>report.text)).size).toBe(1);
  expect(view.source_reading.groups).toEqual([]);expect(view.source_reading.independence).toEqual({kind:'unknown'});
  const [m1,m2,m3]=view.source_reading.reports;
  expect(m1.event_time).toEqual({kind:'unknown'});
  expect(m1.observed_time).toMatchObject({kind:'known',value:10000,basis_ref:{kind:'source_basis',id:'M1-visible-observation-metadata'}});
  expect([m2.event_time,m2.observed_time,m2.source_reported_time]).toEqual([{kind:'unknown'},{kind:'unknown'},{kind:'unknown'}]);
  expect(m3.event_time).toMatchObject({kind:'known',value:10000});
  expect(view.source_reading.deliveries.map(delivery=>[delivery.sent,delivery.received])).toEqual([[44000,45000],[54000,55000],[64000,65000]]);
 }finally{await store.delete();}
});

test('B31 E04 clock partition and operation replay keep the six fixed-channel messages exactly once',async()=>{
 const stores=[new Persistence('b31-owned-large-'+crypto.randomUUID()),new Persistence('b31-owned-small-'+crypto.randomUUID())];
 try{
  const views=[];
  for(const [index,store]of stores.entries()){
   const game=new Game(store);let view=await game.create_run(await sourcePackage(),'research','create');
   for(const to of index?[45000,55000,65000,75000,95000,115000]:[115000]){
    const envelope={run_id:view.run_id,operation_id:'advance-'+to,expected_revision:view.revision,intent:{kind:'advance' as const,to}};
    view=(await game.control_clock(envelope)).view;const repeated=(await game.control_clock(envelope)).view;expect(repeated).toEqual(view);
   }
   if(!('source_reading' in view))throw Error('source projection missing');
   expect(view.source_reading.deliveries).toHaveLength(6);expect(new Set(view.source_reading.deliveries.map(delivery=>delivery.ref.id)).size).toBe(6);
   views.push(JSON.parse(JSON.stringify(view.source_reading).replaceAll(view.run_id,'owned-run')));
  }
  expect(views[0]).toEqual(views[1]);
 }finally{for(const store of stores)await store.delete();}
});

test('B31 E01/E03 source DTO and basic restore preserve the new package while the original package stays unchanged',async()=>{
 const store=new Persistence('b31-owned-restore-'+crypto.randomUUID());
 try{
  const game=new Game(store),old=await game.create_run(outcome,'research','old');expect('source_reading' in old).toBe(false);
  let view=await game.create_run(await sourcePackage(),'research','source');view=(await game.control_clock({run_id:view.run_id,operation_id:'to65',expected_revision:view.revision,intent:{kind:'advance',to:65000}})).view;
  expect(valid_response({request_id:'source',ok:true,view})).toBe(true);
  if(!('source_reading' in view))throw Error('source projection missing');
  const unknown=structuredClone(view);Object.assign(unknown.source_reading.reports[1].event_time,{value:0});expect(valid_response({request_id:'invented-zero',ok:true,view:unknown})).toBe(false);
  const hidden=structuredClone(view);Object.assign(hidden.source_reading,{private_lineage:['hidden']});expect(valid_response({request_id:'hidden',ok:true,view:hidden})).toBe(false);
  const before=structuredClone(view.source_reading),restored=await new Game(store).restore(view.run_id,'restore');
  expect(restored.view).toMatchObject({run_id:view.run_id,sim_time:65000,paused:true,source_reading:before});
  expect(await new Game(store).get_view(old.run_id)).toEqual(old);
 }finally{await store.delete();}
});

test('B31 E06 complete return task has identical legal outcome and resource accounts in the optional package',async()=>{
 const stores=[new Persistence('b31-owned-baseline-task-'+crypto.randomUUID()),new Persistence('b31-owned-source-task-'+crypto.randomUUID())];
 const results:OutcomePlayerView[]=[];
 const outcomeView=(view:GamePlayerView):OutcomePlayerView=>{if(view.scenario_kind!=='play_outcome')throw Error('outcome task missing');return view;};
 try{
  for(const [index,store]of stores.entries()){
   const game=new Game(store);let view=outcomeView(await game.create_run(index?await sourcePackage():outcome,'research','create'));
   const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
   const apply=async(intent:OutcomeEnvelope['intent'],operation:string)=>{view=outcomeView((await game.apply_outcome_intent({run_id:view.run_id,operation_id:operation,expected_revision:view.revision,intent})).view);};
   const advance=async(to:number)=>{view=outcomeView((await game.control_clock({run_id:view.run_id,operation_id:'to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view);};
   const issue=async(id:string,actor='R',basis:unknown[]=[])=>apply({kind:'issue_activity',actor_ref:ref('actor',actor),activity_ref:ref('activity',id),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:basis} as OutcomeEnvelope['intent'],id);
   const returning=async(actor:'R'|'W')=>{view=outcomeView((await game.return_and_deliver({run_id:view.run_id,operation_id:'return-'+actor,expected_revision:view.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor',actor),return_route_ref:ref('return_route',actor+'-B-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-'+actor),basis_delivery_refs:[],allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:0,to:900000}}})).view);};
   await apply({kind:'save_plan',base_plan_ref:null,draft:{purpose:'取得两处记录并返回交付',repair_packs:2}},'plan');await apply({kind:'request_preparation',plan_ref:view.plan!.ref},'prepare');
   await issue('R-to-A');await advance(32000);await issue('A-record');await advance(80000);await issue('R-to-B');await advance(86000);
   await apply({kind:'request_source_validation',basis_delivery_refs:[ref('report_delivery','D-R3')]},'validate');await advance(146000);
   await issue('W-repair','W',[view.preparation_results[0].delivery.ref]);await advance(214000);await returning('W');
   await issue('B-record','R',[view.assessments[0].delivery.ref,view.field_reports.find(item=>item.report.repair_condition==='repaired')!.delivery.ref]);await advance(262000);await returning('R');await advance(368000);
   expect(view).toMatchObject({finished:true,sim_time:368000,outcome:{result:'success',confirmed_people:expect.any(Array),qualified_artifacts:expect.any(Array)},processing:{energy_confirmed:8,energy_reserved:0}});
   expect(view.outcome!.confirmed_people).toHaveLength(6);expect(view.outcome!.qualified_artifacts).toHaveLength(2);expect(valid_response({request_id:'complete',ok:true,view})).toBe(true);
   expect(await game.open_outcome_debrief(view.run_id)).toMatchObject({run_id:view.run_id,status:'ready'});
   results.push(view);
  }
  const accounts=(view:OutcomePlayerView)=>({sim_time:view.sim_time,processing:view.processing,actors:view.actors.map(actor=>({actor:actor.actor,movement_energy:actor.movement_energy,link:actor.link})),outcome:view.outcome});
  const normalized=(view:OutcomePlayerView)=>JSON.parse(JSON.stringify(accounts(view)).replaceAll(view.run_id,'owned-run'));
  expect(normalized(results[1])).toEqual(normalized(results[0]));
 }finally{for(const store of stores)await store.delete();}
},30000);

test.each([false,true])('B31 E05 a context delivery cannot impersonate a task validation credential; optional package=%s',async(optional)=>{
 const store=new Persistence('b31-owned-context-not-access-'+crypto.randomUUID()),game=new Game(store);
 try{
  let view=await game.create_run(optional?await sourcePackage():outcome,'research','create');view=(await game.control_clock({run_id:view.run_id,operation_id:'to86',expected_revision:view.revision,intent:{kind:'advance',to:86000}})).view;
  const before=structuredClone(view);
  // The original task rejects this unknown delivery identity with the same
  // public code, even when the optional source layer has received D-M1.
  await expect(game.apply_outcome_intent({run_id:view.run_id,operation_id:'context-as-task',expected_revision:view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[{run_id:view.run_id,kind:'report_delivery',id:'D-M1',version:1}]}})).rejects.toThrow('INVALID_REQUEST');
  expect(await game.get_view(view.run_id)).toEqual(before);expect(await game.get_receipt(view.run_id,'context-as-task')).toBeNull();
 }finally{await store.delete();}
});

test('B31 E03 each known source time resolves to an actually visible basis and missing basis cannot pass the DTO',async()=>{
 const store=new Persistence('b31-owned-time-bases-'+crypto.randomUUID()),game=new Game(store);
 try{
  let view=await game.create_run(await sourcePackage(),'research','create');view=(await game.control_clock({run_id:view.run_id,operation_id:'to65',expected_revision:view.revision,intent:{kind:'advance',to:65000}})).view;
  if(!('source_reading' in view))throw Error('source projection missing');
  const bases=Reflect.get(view.source_reading,'bases');expect(Array.isArray(bases)).toBe(true);
  for(const report of view.source_reading.reports)for(const time of [report.event_time,report.observed_time,report.source_reported_time])if(time.kind==='known')expect(bases).toEqual(expect.arrayContaining([expect.objectContaining({ref:time.basis_ref,report_ref:report.ref})]));
  const missing=structuredClone(view),observed=missing.source_reading.reports[0].observed_time;if(observed.kind!=='known')throw Error('known observation missing');observed.basis_ref.id='nonexistent-basis';expect(valid_response({request_id:'missing-basis',ok:true,view:missing})).toBe(false);
  const crossRun=structuredClone(view);crossRun.source_reading.bases[0].ref.run_id='another-run';expect(valid_response({request_id:'cross-run-basis',ok:true,view:crossRun})).toBe(false);
  const future=structuredClone(view);future.source_reading.bases[0].value=900000;expect(valid_response({request_id:'future-basis',ok:true,view:future})).toBe(false);
  const wrongReport=structuredClone(view);wrongReport.source_reading.bases[0].report_ref.id='M3';expect(valid_response({request_id:'wrong-report-basis',ok:true,view:wrongReport})).toBe(false);
 }finally{await store.delete();}
});

test.each(['runs','snapshots'])('B31 task metadata refuses a corrupted outer source package in a previous exposed run: %s',async(table)=>{
 const store=new Persistence('b31-owned-exposure-outer-'+crypto.randomUUID()),game=new Game(store),db=new Dexie(store.name);
 try{
  let view=await game.create_run(await sourcePackage(),'research','create');view=(await game.control_clock({run_id:view.run_id,operation_id:'finish',expected_revision:view.revision,intent:{kind:'advance',to:910000}})).view;
  const session=await game.open_outcome_debrief(view.run_id),payload=await game.request_outcome_truth({run_id:view.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,expected_meta_revision:session.metadata_revision,operation_id:'truth'});
  await game.confirm_outcome_truth({run_id:view.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,expected_meta_revision:payload.grant.metadata_revision,operation_id:payload.grant.operation_id,payload_digest:payload.grant.payload_digest});
  await db.open();const key=table==='runs'?view.run_id:view.run_id+':'+session.finished_seq,row=await db.table(table).get(key);if(!row)throw Error('owned saved row missing');
  // Corruption is limited to this test-owned persisted package. The real Game
  // created the complete task and acknowledged truth grant before this write.
  if(table==='runs')row.source_events=[];else row.state.source_events=[];await db.table(table).put(row);
  await expect(game.create_run(outcome,'research','new-after-exposure')).rejects.toThrow('STORAGE_UNCONFIRMED');
  expect(await store.creation('new-after-exposure')).toBeUndefined();
 }finally{db.close();await store.delete();}
},30000);

test('B31 E07/E08/E09 only received pair-scoped credentials group reports or establish two acquisitions, and retraction proves no third source',async()=>{
 const store=new Persistence('b31-owned-relations-'+crypto.randomUUID()),game=new Game(store);
 try{
  let view=await game.create_run(await sourcePackage(),'research','create');
  const advance=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;return view;};
  await advance(65000);if(!('source_reading' in view))throw Error('source projection missing');const originals=structuredClone(view.source_reading.reports);expect(view.source_reading.groups).toEqual([]);
  expect(await advance(75000)).toMatchObject({source_reading:{groups:[{report_refs:[{id:'M1'},{id:'M2'}],basis_refs:[{id:'C12'}]}],scoped_independence:[]}});
  expect(await advance(95000)).toMatchObject({source_reading:{scoped_independence:[{report_refs:[{id:'M1'},{id:'M3'}],count:2,basis_refs:[{id:'C13'}]}]}});
  expect(await advance(115000)).toMatchObject({source_reading:{groups:[],scoped_independence:[{report_refs:[{id:'M1'},{id:'M3'}],count:2}],independence:{kind:'unknown'},relations:[{ref:{id:'L12'},status:'retracted',supporting_evidence_ref:{id:'C12'},retraction_ref:{id:'X12'}}]}});
  if(!('source_reading' in view))throw Error('source projection missing');expect(view.source_reading.reports).toEqual(originals);expect(view.source_reading.deliveries).toHaveLength(6);expect(valid_response({request_id:'relations',ok:true,view})).toBe(true);
 }finally{await store.delete();}
});

test('B31 E10 later credentials and retraction never fill earlier history or rewrite original decision knowledge',async()=>{
 const store=new Persistence('b31-owned-relation-history-'+crypto.randomUUID()),game=new Game(store);
 try{
  let view=await game.create_run(await sourcePackage(),'research','create');
  const advance=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;return view;};
  await advance(65000);const beforeCredential=structuredClone(view);
  view=(await game.apply_outcome_intent({run_id:view.run_id,operation_id:'plan-before-credential',expected_revision:view.revision,intent:{kind:'save_plan',base_plan_ref:null,draft:{purpose:'原文与依据分别阅读',repair_packs:2}}})).view;
  if(view.scenario_kind!=='play_outcome')throw Error('outcome task missing');const decision=structuredClone(view.decision_records[0]);
  const grouped=structuredClone(await advance(75000));await advance(95000);await advance(115000);
  const history=await game.get_replay(view.run_id,75000,grouped.revision);expect(await history.get_view(view.run_id)).toMatchObject({can_issue:false,source_reading:{groups:[{report_refs:[{id:'M1'},{id:'M2'}]}],scoped_independence:[]}});
  const earlier=await game.get_replay(view.run_id,65000,beforeCredential.revision);expect(await earlier.get_view(view.run_id)).toMatchObject({source_reading:{groups:[],scoped_independence:[]}});
  const current=await game.get_view(view.run_id);expect(current).toMatchObject({source_reading:{groups:[],scoped_independence:[{count:2}]}});if(current.scenario_kind!=='play_outcome')throw Error('outcome task missing');expect(current.decision_records[0]).toEqual(decision);
 }finally{await store.delete();}
});

async function ownedSource(mutator:(definition:SourceTimeDefinition)=>void){const value=structuredClone(await sourcePackage()) as unknown as SourceTimeDefinition;mutator(value);value.profile.parameters.extra_messages=value.catalogs.messages.length;value.profile.registry[0].value=value.catalogs.messages.length;value.hashes.profile=await hash(value.profile);value.hashes.catalogs=await hash(value.catalogs);const {definition_hash,...body}=value;void definition_hash;value.definition_hash=await hash(body);return value;}

test('B31 E11/E12 conflict affects only its received pair and retransmission preserves original report identity',async()=>{
 const definition=await ownedSource(d=>{
  d.catalogs.evidence.push({id:'C12-independent',version:1,issuer:'ArchiveSource',authority:'source_metadata',kind:'explicit_independent_acquisition_evidence',claim:'该两份记录有两份不同采集凭证',covered_reports:['M1','M2'],visible_acquisition_records:['C12-acquire-A','C12-acquire-B'],basis:'C12-independent-basis'});
  d.catalogs.messages.push({id:'D-C12-independent',report:'C12-independent',sender:'ArchiveSource',recipient:'HQ',sent:84000,received:85000},{id:'D-M1-repeat',report:'M1',sender:'ArchiveSource',recipient:'HQ',sent:79000,received:80000});
 });
 const store=new Persistence('b31-owned-pair-conflict-'+crypto.randomUUID(),[],[],[],[],[definition]),game=new Game(store);
 try{
  let view=await game.create_run(definition,'research','create');view=(await game.control_clock({run_id:view.run_id,operation_id:'to95',expected_revision:view.revision,intent:{kind:'advance',to:95000}})).view;
  expect(view).toMatchObject({source_reading:{groups:[],relations:[{status:'conflicted'}],conflicts:[{report_refs:[{id:'M1'},{id:'M2'}],basis_refs:[{id:'C12'},{id:'C12-independent'}]}],scoped_independence:[{report_refs:[{id:'M1'},{id:'M3'}],count:2}],independence:{kind:'unknown'}}});
  if(!('source_reading' in view))throw Error('source reading missing');expect(view.source_reading.reports).toHaveLength(3);expect(view.source_reading.deliveries.filter(d=>d.report_ref.id==='M1')).toHaveLength(2);expect(valid_response({request_id:'conflicted-pair',ok:true,view})).toBe(true);
  const restored=await new Game(store).restore(view.run_id,'restore');expect(restored.view).toMatchObject({source_reading:view.source_reading});
 }finally{await store.delete();}
});

test('B31 E12 malformed relation credentials uniformly fail the public DTO without accepting hidden, future or cross-run references',async()=>{
 const store=new Persistence('b31-owned-invalid-relations-'+crypto.randomUUID()),game=new Game(store);
 try{
  let view=await game.create_run(await sourcePackage(),'research','create');view=(await game.control_clock({run_id:view.run_id,operation_id:'to115',expected_revision:view.revision,intent:{kind:'advance',to:115000}})).view;if(!('source_reading' in view))throw Error('source reading missing');
  for(const mutate of [
   (v:typeof view)=>{v.source_reading.evidence[0].ref.run_id='another-run';},
   (v:typeof view)=>{Object.assign(v.source_reading.evidence[0].ref,{kind:'engine_provenance'});},
   (v:typeof view)=>{Object.assign(v.source_reading.evidence[0].ref,{version:2});},
   (v:typeof view)=>{v.source_reading.evidence[0].received=999999;},
   (v:typeof view)=>{Object.assign(v.source_reading.evidence[0],{issuer:'unknown-private-issuer'});},
   (v:typeof view)=>{Object.assign(v.source_reading.evidence[2],{target_evidence_ref:{run_id:v.run_id,kind:'source_report',id:'unknown',version:1}});},
   (v:typeof view)=>{Object.assign(v.source_reading.scoped_independence[0],{count:3});},
   (v:typeof view)=>{Object.assign(v.source_reading.relations[0],{private_lineage:['secret']});},
   (v:typeof view)=>{v.source_reading.evidence.splice(0,1);},
   (v:typeof view)=>{v.source_reading.deliveries[0].report_ref.id='unknown-private-report';},
   (v:typeof view)=>{v.source_reading.deliveries[1].knowledge_seq=1;},
  ]){const invalid=structuredClone(view);mutate(invalid);expect(valid_response({request_id:'bad-relation',ok:true,view:invalid})).toBe(false);}
  expect(await game.get_view(view.run_id)).toEqual(view);
 }finally{await store.delete();}
});

test.each(['issuer','authority','missing-target','wrong-retraction-target','future-target','duplicate-message','unknown-report','negative-receive'])('B31 E12 registered malformed credential package is rejected before creation: %s',async(kind)=>{
 const definition=await ownedSource(d=>{
  if(kind==='issuer')d.catalogs.evidence[0].issuer='HiddenIssuer';
  if(kind==='authority')d.catalogs.evidence[0].authority='engine_truth';
  if(kind==='missing-target')d.catalogs.evidence[0].from='missing';
  if(kind==='wrong-retraction-target')d.catalogs.evidence[2].target_basis='C13';
  if(kind==='future-target')d.catalogs.messages[0].received=125000;
  if(kind==='duplicate-message')d.catalogs.messages[1].id=d.catalogs.messages[0].id;
  if(kind==='unknown-report')d.catalogs.messages[0].report='hidden-report';
  if(kind==='negative-receive')d.catalogs.messages[0].received=-1;
 });
 const store=new Persistence('b31-owned-invalid-definition-'+crypto.randomUUID(),[],[],[],[],[definition]);try{await expect(new Game(store).create_run(definition,'research','create')).rejects.toThrow('INVALID_DEFINITION');expect(await store.creation('create')).toBeUndefined();}finally{await store.delete();}
});


test.each(['C12','C13','X12'])('B31 E12 DTO rejects a consistently reordered credential received before its target original: %s',async(id)=>{
 const store=new Persistence('b31-owned-dto-received-before-target-'+crypto.randomUUID()),game=new Game(store);
 try{
  let view=await game.create_run(await sourcePackage(),'research','create');view=(await game.control_clock({run_id:view.run_id,operation_id:'to115',expected_revision:view.revision,intent:{kind:'advance',to:115000}})).view;if(!('source_reading' in view))throw Error('source reading missing');
  const invalid=structuredClone(view),reading=invalid.source_reading,moved=reading.deliveries.find(d=>d.report_ref.id===id)!;moved.sent=id==='C12'?49000:id==='C13'?59000:74000;moved.received=moved.sent+1000;
  reading.deliveries.sort((a,b)=>a.received-b.received||a.ref.id.localeCompare(b.ref.id));reading.deliveries.forEach((d,i)=>d.knowledge_seq=i+1);
  for(const e of reading.evidence){const d=reading.deliveries.find(d=>d.ref.id===e.delivery_ref.id)!;e.received=d.received;e.knowledge_seq=d.knowledge_seq;}
  for(const r of reading.relations){const e=reading.evidence.find(e=>e.ref.id===r.supporting_evidence_ref.id)!;r.received=e.received;r.effective_knowledge_seq=reading.evidence.find(e=>e.ref.id===r.retraction_ref?.id)?.knowledge_seq??e.knowledge_seq;}
  expect(valid_response({request_id:'credential-before-target',ok:true,view:invalid})).toBe(false);expect(await game.get_view(view.run_id)).toEqual(view);
 }finally{await store.delete();}
});


test('B31 E07 a received C13 establishes its bounded pair even when C12 and its retraction are never delivered',async()=>{
 const definition=await ownedSource(d=>{d.catalogs.messages=d.catalogs.messages.filter(m=>!['C12','X12'].includes(m.report));});const store=new Persistence('b31-owned-independent-without-forward-'+crypto.randomUUID(),[],[],[],[],[definition]),game=new Game(store);
 try{let view=await game.create_run(definition,'research','create');view=(await game.control_clock({run_id:view.run_id,operation_id:'to95',expected_revision:view.revision,intent:{kind:'advance',to:95000}})).view;expect(view).toMatchObject({source_reading:{relations:[],groups:[],evidence:[{ref:{id:'C13'}}],scoped_independence:[{report_refs:[{id:'M1'},{id:'M3'}],count:2}],independence:{kind:'unknown'}}});expect(valid_response({request_id:'independent-without-forward',ok:true,view})).toBe(true);}finally{await store.delete();}
});


async function sourceWithLocalDeliveries(hidden:string[]){return ownedSource(d=>{d.catalogs.private_lineage=hidden;d.catalogs.messages.push(...d.catalogs.messages.map(m=>({...m,id:m.id+'-R',recipient:'R',sent:m.sent+13000,received:m.received+13000})));});}

test('B31 E14 every actual recipient delivery must be late enough for its known source times',async()=>{
 const definition=await ownedSource(d=>{d.catalogs.messages.push({id:'M1-early-R',report:'M1',sender:'ArchiveSource',recipient:'R',sent:0,received:5000});});
 const store=new Persistence('b31-owned-future-local-time-'+crypto.randomUUID(),[],[],[],[],[definition]);
 try{await expect(new Game(store).create_run(definition,'research','create')).rejects.toThrow('INVALID_DEFINITION');expect(await store.creation('create')).toBeUndefined();}finally{await store.delete();}
});

test('B31 E14 HQ and existing R acquire source relations only from their own actual receipts',async()=>{
 const definition=await sourceWithLocalDeliveries(['private-A','private-A','private-C']),store=new Persistence('b31-owned-actor-local-'+crypto.randomUUID(),[],[],[],[],[definition]),game=new Game(store);
 try{let view=await game.create_run(definition,'research','create');for(const to of [75000,95000,115000,128000]){
  view=(await game.control_clock({run_id:view.run_id,operation_id:'to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;const actor=await game.get_actor_view(view.run_id,'R'),local=Reflect.get(actor,'source_reading');
  if(to===75000){expect(view).toMatchObject({source_reading:{groups:[{report_refs:[{id:'M1'},{id:'M2'}]}]}});expect(local).toMatchObject({reports:[{ref:{id:'M1'}},{ref:{id:'M2'}}],relations:[],groups:[],scoped_independence:[]});}
  if(to===95000){expect(view).toMatchObject({source_reading:{scoped_independence:[{count:2}]}});expect(local).toMatchObject({groups:[{report_refs:[{id:'M1'},{id:'M2'}]}],scoped_independence:[]});}
  if(to===115000){expect(view).toMatchObject({source_reading:{groups:[],relations:[{status:'retracted'}]}});expect(local).toMatchObject({groups:[{report_refs:[{id:'M1'},{id:'M2'}]}],relations:[{status:'confirmed'}],scoped_independence:[{count:2}]});}
  if(to===128000)expect(local).toMatchObject({groups:[],relations:[{status:'retracted'}],scoped_independence:[{count:2}],independence:{kind:'unknown'}});
  const deliveries=Reflect.get(local,'deliveries') as Array<{recipient:string;knowledge_seq:number}>;expect(deliveries.map(d=>d.knowledge_seq)).toEqual(deliveries.map((_,i)=>i+1));expect(deliveries.every(d=>d.recipient==='R')).toBe(true);
 }}finally{await store.delete();}
});

test('B31 E13 private lineage changes cannot change HQ or actual local R inputs, counts, order, available actions or ordinary errors',async()=>{
 const definitions=await Promise.all([sourceWithLocalDeliveries(['PRIVATE-PROBE']),sourceWithLocalDeliveries(['hidden-X','hidden-Y','hidden-X','hidden-Z'])]),stores=definitions.map(d=>new Persistence('b31-owned-opacity-'+crypto.randomUUID(),[],[],[],[],[d]));
 const samples=[];try{for(const [i,store]of stores.entries()){
  const game=new Game(store);let view=await game.create_run(definitions[i],'research','create');const rows=[];
  for(const to of [65000,75000,95000,115000,128000]){view=(await game.control_clock({run_id:view.run_id,operation_id:'to-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;const local=await game.get_actor_view(view.run_id,'R');expect(Reflect.get(local,'source_reading')).toBeDefined();rows.push({HQ:view,R:local});}
  await expect(game.get_actor_view(view.run_id,'PRIVATE-PROBE')).rejects.toThrow('UNSUPPORTED');await expect(game.apply_outcome_intent({run_id:view.run_id,operation_id:'unknown-private-ref',expected_revision:view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[{run_id:view.run_id,kind:'report_delivery',id:'PRIVATE-PROBE',version:1}]}})).rejects.toThrow('INVALID_REQUEST');
  rows.push({HQ:await game.get_view(view.run_id),R:await game.get_actor_view(view.run_id,'R')});samples.push(JSON.parse(JSON.stringify(rows).replaceAll(view.run_id,'paired-owned-run')));
 }expect(samples[0]).toEqual(samples[1]);}finally{for(const store of stores)await store.delete();}
});


test.each(['integrity','report-ref','knowledge-seq','cross-run-ref','catalog-hash','task-semantic'])('B31 E16 cold restore rejects a corrupted owned source package without deleting its saved bytes: %s',async(kind)=>{
 const store=new Persistence('b31-owned-corrupt-package-'+crypto.randomUUID()),game=new Game(store),db=new Dexie(store.name);
 try{let view=await game.create_run(await sourcePackage(),'research','create');view=(await game.control_clock({run_id:view.run_id,operation_id:'to95',expected_revision:view.revision,intent:{kind:'advance',to:95000}})).view;await db.open();const row=await db.table('runs').get(view.run_id);expect(row.schema).toBe(11);
  if(kind==='integrity')row.integrity='0'.repeat(64);
  if(kind==='report-ref')row.source_events[0].report_ref.id='unknown-original';
  if(kind==='knowledge-seq')row.source_events[0].knowledge_seq=9;
  if(kind==='cross-run-ref')row.source_events[0].ref.run_id='another-run';
  if(kind==='catalog-hash')row.hashes.catalogs='0'.repeat(64);
  if(kind==='task-semantic'){row.task.sim_time++;row.task.integrity=await state_hash(row.task);}
  if(kind!=='integrity')row.integrity=await state_hash(row);await db.table('runs').put(row);
  await expect(new Game(store).restore(view.run_id,'invalid-restore')).rejects.toThrow('INVALID_SAVE');expect(await db.table('runs').get(view.run_id)).toEqual(row);expect(await store.receipt(view.run_id,'invalid-restore')).toBeUndefined();
 }finally{db.close();await store.delete();}
});

test('B31 E16 source restart uses a new run and source references while keeping the read-only parent and rng origin',async()=>{
 const store=new Persistence('b31-owned-source-restart-'+crypto.randomUUID()),game=new Game(store);
 try{let view=await game.create_run(await sourcePackage(),'research','create');view=(await game.control_clock({run_id:view.run_id,operation_id:'to115',expected_revision:view.revision,intent:{kind:'advance',to:115000}})).view;const parentSources=structuredClone(Reflect.get(view,'source_reading')),actor=await game.get_actor_view(view.run_id,'R'),child=await game.restart_run(view.run_id,'restart');expect(child).toMatchObject({source_run:view.run_id,sim_time:0,paused:true,source_reading:{reports:[],deliveries:[]}});expect(child.run_id).not.toBe(view.run_id);expect(await game.get_actor_view(view.run_id,'R')).toEqual(actor);const parent=await game.get_view(view.run_id);expect(parent.can_issue).toBe(false);expect(Reflect.get(parent,'source_reading')).toEqual(parentSources);await expect(game.save({run_id:view.run_id,operation_id:'change-parent',expected_revision:parent.revision,intent:{kind:'save'}})).rejects.toThrow('HISTORY_READ_ONLY');expect(await store.read_committed(child.run_id)).toMatchObject({schema:11,source_run:view.run_id,rng:{origin:view.run_id}});
  const advanced=(await game.control_clock({run_id:child.run_id,operation_id:'child-to115',expected_revision:child.revision,intent:{kind:'advance',to:115000}})).view;if(!('source_reading' in advanced))throw Error('source package missing');expect(advanced.source_reading.deliveries.every(d=>d.ref.run_id===child.run_id&&d.report_ref.run_id===child.run_id)).toBe(true);expect(await new Game(store).get_view(child.run_id)).toMatchObject({run_id:child.run_id,source_run:view.run_id});
 }finally{await store.delete();}
});


test('B31 E14 an undelivered HQ-only source layer cannot change existing R decision inputs',async()=>{
 const definition=await sourceWithLocalDeliveries(['private-A']),stores=[new Persistence('b31-owned-local-baseline-'+crypto.randomUUID()),new Persistence('b31-owned-local-no-receipt-'+crypto.randomUUID(),[],[],[],[],[definition])];
 try{const rows=[];for(const [index,store]of stores.entries()){const game=new Game(store);let view=await game.create_run(index?definition:outcome,'research','create');const inputs=[await game.get_actor_view(view.run_id,'R')];view=(await game.control_clock({run_id:view.run_id,operation_id:'to45',expected_revision:view.revision,intent:{kind:'advance',to:45000}})).view;inputs.push(await game.get_actor_view(view.run_id,'R'));rows.push(JSON.parse(JSON.stringify(inputs).replaceAll(view.run_id,'paired-owned-run')));}expect(rows[1]).toEqual(rows[0]);}finally{for(const store of stores)await store.delete();}
});
