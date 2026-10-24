import {expect,test,vi} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {valid_response} from '../src/dto';
import {verify_collection_report_digests} from '../src/knowledge-collection-dto';
import {hash} from '../src/core/scenario';
import {canonical} from '../src/core/snapshot';
import {valid_request} from '../src/protocol';
import {Transport} from '../src/transport';

test.each([{work:'archive',restore:false},{work:'archive',restore:true},{work:'position',restore:false},{work:'position',restore:true}])('KA-E12 delayed start rechecks R capacity after gate recovery and $work reception, restore=$restore',async({work,restore})=>{
  const store=new Persistence('ka-owned-gate-start-capacity-'+crypto.randomUUID());let game=new Game(store,{knowledge_collection_gate_profile:'initial_unknown_then_met'});
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref:work==='archive'?'KA-SOURCE3-01':'KA-LATE-POSITION-01'},'research','create');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'collect-first',expected_revision:view.revision,intent:{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000}})).view;
    if(work==='position')view=(await game.control_clock({run_id:view.run_id,operation_id:'at-1',expected_revision:view.revision,intent:{kind:'advance',to:1000}})).view;
    const intent=work==='archive'?{kind:'request_archive_read',actor:'R',entry:'survey',method_ref:ref('method','B-archive-read'),authority_ref:ref('authority','KA-INITIAL'),forward_credentials:'defer'}:{kind:'request_self_position',actor:'R',recipient:'HQ',method_ref:ref('method','self-position-registration'),authority_ref:ref('authority','KA-INITIAL')};
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'other-device-work',expected_revision:view.revision,intent})).view;
    if(restore){
      view=(await game.control_clock({run_id:view.run_id,operation_id:'at-2500',expected_revision:view.revision,intent:{kind:'advance',to:2500}})).view;
      view=(await game.save({run_id:view.run_id,operation_id:'save-conflict',expected_revision:view.revision,intent:{kind:'save'}})).view;
      game=new Game(new Persistence(store.name));view=(await game.restore(view.run_id,'restore-conflict')).view;
    }
    view=(await game.control_clock({run_id:view.run_id,operation_id:'at-34',expected_revision:view.revision,intent:{kind:'advance',to:34000}})).view;
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    expect(view.reports.find(report=>report.method==='limited-text-collection')).toMatchObject({body:{kind:'collection_failed',reason:'capacity',collection_work_ms:0},observed_time:{kind:'unknown'}});
    const state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong state');
    expect(state.records).toHaveLength(0);expect(state.actors.R.energy_used_uj).toBe(work==='archive'?74000000:70000000);
    expect(valid_response({request_id:'actual-start-capacity',ok:true,view})).toBe(true);
  }finally{await store.delete();}
});

test('KA-E12 review regression turns collection requested after W departure into an actual local failure receipt',async()=>{
  const store=new Persistence('ka-owned-departed-collection-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research','create');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'return-W',expected_revision:view.revision,intent:{kind:'return_to_headquarters',actor:'W',authority_ref:ref('authority','KA-INITIAL')}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'at-2',expected_revision:view.revision,intent:{kind:'advance',to:2000}})).view;
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'away-W',expected_revision:view.revision,intent:{kind:'request_collection',actor:'W',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-QUALIFIED'),method_ref:ref('method','qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-W')],collection_window:{from:60000,to:91000},needed_by:900000}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'at-93',expected_revision:view.revision,intent:{kind:'advance',to:93000}})).view;
    expect(view).toMatchObject({sim_time:93000,reports:[{source_actor:'W',body:{kind:'collection_failed',reason:'not_at_site',collection_work_ms:0}}],facility_knowledge:null});
    const state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong state');
    expect(state.records).toHaveLength(0);expect(state.actors.W.energy_used_uj).toBe(46500000);
    expect(valid_response({request_id:'departed-source',ok:true,view})).toBe(true);
  }finally{await store.delete();}
});

test('KA-E12 review regression respects the existing R device/labor slot when archive reading precedes collection',async()=>{
  const store=new Persistence('ka-owned-archive-capacity-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref:'KA-SOURCE3-01'},'research','create');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'read-first',expected_revision:view.revision,intent:{kind:'request_archive_read',actor:'R',entry:'survey',method_ref:ref('method','B-archive-read'),authority_ref:ref('authority','KA-INITIAL'),forward_credentials:'defer'}})).view;
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'conflicting-collect',expected_revision:view.revision,intent:{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'at-34',expected_revision:view.revision,intent:{kind:'advance',to:34000}})).view;
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    expect(view.reports.find(report=>report.source_actor==='R')).toMatchObject({body:{kind:'collection_failed',reason:'capacity',collection_work_ms:0}});
    const state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong state');
    expect(state.records).toHaveLength(0);expect(state.actors.R.energy_used_uj).toBe(74000000);
    expect(valid_response({request_id:'occupied-source-device',ok:true,view})).toBe(true);
  }finally{await store.delete();}
});

test.each(['basis_refs','credential_roles'])('KA-E20 review regression rejects sparse %s atomically and preserves reopen',async(field)=>{
  const f=await source_fixture();
  try{
    if(f.view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    const malformed=Array(1);Reflect.set(malformed,'extra',field==='basis_refs'?f.view.reports[0].ref:'pair-RW');
    const intent=field==='basis_refs'?{kind:'record_collection_assessment',field:'B.condition',conclusion:'unconfirmed',basis_refs:malformed}:{kind:'forward_source_credential',actor:'R',recipient:'HQ',reader_request_ref:f.view.archive_requests[0].ref,credential_roles:malformed,authority_ref:f.ref('authority','KA-INITIAL')};
    const before=await f.store.read_committed(f.view.run_id);
    await expect(f.apply('sparse-array',intent)).rejects.toThrow('INVALID_INPUT');
    expect(await f.store.read_committed(f.view.run_id)).toEqual(before);expect(await f.game.get_receipt(f.view.run_id,'sparse-array')).toBeNull();
    expect(await new Game(new Persistence(f.store.name)).get_view(f.view.run_id)).toEqual(f.view);
  }finally{await f.store.delete();}
});

test.each(['revocation','contradiction'])('KA-E15 review regression cannot use a %s read as possession of survey credentials',async(entry)=>{
  const store=new Persistence('ka-owned-source-possession-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref:'KA-SOURCE3-01'},'research','create');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'read-notice-only',expected_revision:view.revision,intent:{kind:'request_archive_read',actor:'R',entry,method_ref:ref('method','B-archive-read'),authority_ref:ref('authority','KA-INITIAL'),forward_credentials:'defer'}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'notice-arrived',expected_revision:view.revision,intent:{kind:'advance',to:5000}})).view;
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'unread-pair',expected_revision:view.revision,intent:{kind:'forward_source_credential',actor:'R',recipient:'HQ',reader_request_ref:view.archive_requests[0].ref,credential_roles:['pair-RW'],authority_ref:ref('authority','KA-INITIAL')}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'negative-receipt',expected_revision:view.revision,intent:{kind:'advance',to:7000}})).view;
    expect(view).toMatchObject({source_credentials:[],source_forward_requests:[{receipt:{outcome:'not_available',sent_at:6000,received_at:7000}}]});
    expect(valid_response({request_id:'unread-pair',ok:true,view})).toBe(true);
  }finally{await store.delete();}
});

test('KA-E15 review regression bounds repeated pending forwards and returns the original public pending ref',async()=>{
  const f=await source_fixture();
  try{
    if(f.view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    await f.at(120000);
    const intent={kind:'forward_source_credential',actor:'R',recipient:'HQ',reader_request_ref:f.view.archive_requests[0].ref,credential_roles:['pair-RW','pair-RS','pair-WS'],authority_ref:f.ref('authority','KA-INITIAL')};
    await f.apply('one-forward',intent);
    const pending=f.view.source_forward_requests[0].ref;
    for(let i=0;i<10;i++)await f.apply('extra-forward-'+i,intent);
    const state=await f.store.read_committed(f.view.run_id);if(state?.schema!==14)throw Error('Wrong state');
    expect(state.source_forwards).toHaveLength(1);expect(state.commands.filter(command=>command.kind==='receive_source_forward')).toHaveLength(1);
    expect(f.view).toMatchObject({control_admissions:Array.from({length:10},(_,i)=>({operation_id:'extra-forward-'+i,outcome:'busy',pending_ref:pending}))});
    await f.at(124000);expect(f.view).toMatchObject({source_relationships:{global_independence:{kind:'confirmed',count:3}}});
    expect(valid_response({request_id:'bounded-forwards',ok:true,view:f.view})).toBe(true);
  }finally{await f.store.delete();}
});

test('KA-E12 review regression handles a future W task and return without rolling back clock advancement',async()=>{
  const store=new Persistence('ka-owned-future-return-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research','create');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'future-W',expected_revision:view.revision,intent:{kind:'request_collection',actor:'W',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-QUALIFIED'),method_ref:ref('method','qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-W')],collection_window:{from:60000,to:91000},needed_by:900000}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'at-2',expected_revision:view.revision,intent:{kind:'advance',to:2000}})).view;
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'return-W',expected_revision:view.revision,intent:{kind:'return_to_headquarters',actor:'W',authority_ref:ref('authority','KA-INITIAL')}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'at-93',expected_revision:view.revision,intent:{kind:'advance',to:93000}})).view;
    expect(view).toMatchObject({sim_time:93000,return_requests:[{acknowledgement:{outcome:'capacity'}}],reports:[{source_actor:'W',body:{kind:'qualified_facility_field'}}]});
    expect(valid_response({request_id:'future-task-return',ok:true,view})).toBe(true);
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'return-W-retry',expected_revision:view.revision,intent:{kind:'return_to_headquarters',actor:'W',authority_ref:ref('authority','KA-INITIAL')}})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'at-95',expected_revision:view.revision,intent:{kind:'advance',to:95000}})).view;
    expect(view).toMatchObject({return_requests:[{acknowledgement:{outcome:'capacity'}},{acknowledgement:{outcome:'moving',sent_at:94000,received_at:95000}}]});
    expect(valid_response({request_id:'return-after-capacity-release',ok:true,view})).toBe(true);
  }finally{await store.delete();}
});

class OwnedSourcePort{
  static current:OwnedSourcePort;
  latest:Record<string,unknown>|null=null;
  onmessage:((event:MessageEvent<unknown>)=>void)|null=null;
  onerror:(()=>void)|null=null;
  constructor(){OwnedSourcePort.current=this;}
  postMessage(value:Record<string,unknown>){this.latest=value;}
  emit(value:unknown){this.onmessage?.(new MessageEvent('message',{data:value}));}
  terminate(){}
}

test('KA-E20 actual private archive variants produce identical HQ views, errors, counts and ordering before their different material arrives through Transport',async()=>{
  const rows:Array<Array<Awaited<ReturnType<Game['get_view']>>>>=[];
  for(const source_profile of ['normal','missing_pair_WS','insufficient_scope_WS']){
    const store=new Persistence('ka-owned-knowledge-pair-'+crypto.randomUUID()),game=new Game(store);
    const uuid=vi.spyOn(crypto,'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000020');
    try{
      let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref:'KA-SOURCE3-01',source_profile},'research','create');uuid.mockRestore();
      const row=[structuredClone(view)],ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
      const at=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
      for(const actor of ['R','W'] as const){
        if(actor==='W')await at(59000);
        view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'collect-'+actor,expected_revision:view.revision,intent:{kind:'request_collection',actor,question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope',actor==='R'?'B-LIMITED':'B-QUALIFIED'),method_ref:ref('method',actor==='R'?'limited-text-collection':'qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-'+actor)],collection_window:actor==='R'?{from:1000,to:31000}:{from:60000,to:91000},needed_by:900000,...(actor==='R'?{delivery_copies:3}:{})}})).view;
      }
      await at(100000);row.push(structuredClone(view));
      const intent={kind:'request_archive_read',actor:'R',entry:'survey',method_ref:ref('method','B-archive-read'),authority_ref:ref('authority','KA-INITIAL'),forward_credentials:'all'};
      const before=await store.read_committed(view.run_id);
      await expect(game.apply_collection_intent({run_id:view.run_id,operation_id:'bad-media',expected_revision:view.revision,intent:{...intent,media:{kind:'image',storage_ref:'private'}}})).rejects.toThrow('INVALID_INPUT');
      expect(await store.read_committed(view.run_id)).toEqual(before);
      view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'read',expected_revision:view.revision,intent})).view;
      await at(104000);row.push(structuredClone(view));rows.push(row);
    }finally{uuid.mockRestore();await store.delete();}
  }
  expect(rows[1]).toEqual(rows[0]);expect(rows[2]).toEqual(rows[0]);
  let transport:Transport|undefined;
  try{
    vi.stubGlobal('Worker',OwnedSourcePort);transport=new Transport();
    for(const row of rows)for(const view of row){
      const response=transport.request({kind:'current',run_id:view.run_id}),port=OwnedSourcePort.current,request_id=port.latest?.request_id;
      port.emit({request_id,ok:true,view});expect(await response).toEqual({request_id,ok:true,view});
    }
    for(const extra of [{world:{condition:'operable'}},{EngineProvenanceGraph:{roots:['hidden-root']}},{media:[{storage_ref:'private'}]}]){
      const view=rows[0][2],response=transport.request({kind:'current',run_id:view.run_id}),port=OwnedSourcePort.current,request_id=port.latest?.request_id;
      port.emit({request_id,ok:true,view:{...view,...extra}});expect(await response).toEqual({request_id,ok:false,code:'CHANNEL_UNCERTAIN'});
    }
  }finally{transport?.close();vi.unstubAllGlobals();}
});

test.each([31000,89500,118500,119500])('KA-E17 supporting recovery resumes old-position/device/control/source at %i without extra material or energy',async(checkpoint)=>{
  const name='ka-owned-position-resume-'+crypto.randomUUID();let store=new Persistence(name),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref:'KA-LATE-POSITION-01'},'research','create');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    const at=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    const apply=async(operation_id:string,intent:unknown)=>{view=(await game.apply_collection_intent({run_id:view.run_id,operation_id,expected_revision:view.revision,intent})).view;};
    const restore=async()=>{
      view=(await game.save({run_id:view.run_id,operation_id:'save',expected_revision:view.revision,intent:{kind:'save'}})).view;
      const before=await store.read_committed(view.run_id);if(before?.schema!==14)throw Error('Wrong state');
      store=new Persistence(name);game=new Game(store);view=(await game.restore(view.run_id,'restore')).view;
      const after=await store.read_committed(view.run_id);if(after?.schema!==14)throw Error('Wrong state');
      expect(after.sim_time).toBe(checkpoint);expect(after.schedule).toEqual(before.schedule);expect(after.actors).toEqual(before.actors);expect(after.reports).toEqual(before.reports);expect(after.source_messages).toEqual(before.source_messages);
    };
    await apply('collect-R',{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000});
    await at(31000);if(checkpoint===31000)await restore();
    await at(32000);await apply('return-R',{kind:'return_to_headquarters',actor:'R',authority_ref:ref('authority','KA-INITIAL')});
    await at(88000);await apply('new-position',{kind:'request_self_position',actor:'R',recipient:'HQ',method_ref:ref('method','self-position-registration'),authority_ref:ref('authority','KA-INITIAL')});
    if(checkpoint===89500){await at(89500);await restore();}
    await at(91000);await at(118000);
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    await apply('old-position',{kind:'forward_position_report',actor:'R',recipient:'HQ',collection_request_ref:view.collection_requests[0].ref,output_role:'collection_end_self_position',authority_ref:ref('authority','KA-INITIAL')});
    if(checkpoint===118500||checkpoint===119500){await at(checkpoint);await restore();}
    await at(120000);
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    expect(view.deliveries.map(item=>[item.report_ref.id,item.sent_at,item.received_at])).toEqual([['collection-1.report',31000,32000],['R-self-position-new',90000,91000],['R-self-position-old',119000,120000]]);
    const state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong state');
    expect(state.actors.R.energy_used_uj).toBe(302000000);expect(state.records).toHaveLength(1);expect(state.reports).toHaveLength(3);
    expect(view.actors[0].position).toMatchObject({point:[201.55,150],observed_at:90000,received_at:91000});
  }finally{await store.delete();}
});

test('KA-E18 resolves the registered output only at R, preserves original identity on repeated forwarding and rejects private/cross-run inputs',async()=>{
  const store=new Persistence('ka-owned-position-reference-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref:'KA-LATE-POSITION-01'},'research','create');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    const apply=async(operation_id:string,intent:unknown)=>{const result=await game.apply_collection_intent({run_id:view.run_id,operation_id,expected_revision:view.revision,intent});view=result.view;return result;};
    const at=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    await apply('collect',{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000});
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    const intent={kind:'forward_position_report',actor:'R',recipient:'HQ',collection_request_ref:view.collection_requests[0].ref,output_role:'collection_end_self_position',authority_ref:ref('authority','KA-INITIAL')};
    await apply('early',intent);expect(view).toMatchObject({reports:[],position_requests:[{terminal_receipt:null}]});
    await at(1000);expect(view).toMatchObject({reports:[],position_requests:[{terminal_receipt:null}]});
    await at(3000);expect(view).toMatchObject({reports:[],position_requests:[{terminal_receipt:{outcome:'not_available',sent_at:2000,received_at:3000}}]});
    const before=await store.read_committed(view.run_id);
    for(const patch of [{collection_request_ref:{...intent.collection_request_ref,run_id:'other-run'}},{actor:'W'},{output_role:'private-output'},{report_id:'R-self-position-old'},{media:{storage_ref:'private'}}]){
      const envelope={run_id:view.run_id,operation_id:'bad',expected_revision:view.revision,intent:{...intent,...patch}};
      expect(valid_request({request_id:'bad-position',kind:'operate_knowledge_collection',envelope})).toBe(false);
      await expect(game.apply_collection_intent(envelope)).rejects.toThrow('INVALID_INPUT');
      expect(await store.read_committed(view.run_id)).toEqual(before);
    }
    await at(32000);
    const envelope={run_id:view.run_id,operation_id:'first-forward',expected_revision:view.revision,intent};
    const issued=await apply('first-forward',intent);await at(34000);
    const once=await store.read_committed(view.run_id);expect((await game.apply_collection_intent(envelope)).receipt).toEqual(issued.receipt);expect(await store.read_committed(view.run_id)).toEqual(once);
    await apply('second-forward',intent);await at(36000);
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    expect(view.reports.filter(report=>report.body.kind==='self_position')).toMatchObject([{ref:{id:'R-self-position-old'},observed_time:{value:30000},generated_at:31000,source_reported_time:{value:31000}}]);
    expect(view.deliveries.slice(1).map(delivery=>[delivery.report_ref.id,delivery.sent_at,delivery.received_at])).toEqual([['R-self-position-old',33000,34000],['R-self-position-old',35000,36000]]);
    expect(valid_response({request_id:'position-repeat',ok:true,view})).toBe(true);
  }finally{await store.delete();}
});

test('KA-E17 produces its new and late old position through real work, movement and source FIFO',async()=>{
  const store=new Persistence('ka-owned-late-position-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref:'KA-LATE-POSITION-01'},'research','create');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    const at=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    const apply=async(operation_id:string,intent:unknown)=>{view=(await game.apply_collection_intent({run_id:view.run_id,operation_id,expected_revision:view.revision,intent})).view;};
    await apply('collect-R',{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000});
    await at(32000);
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    const request=view.collection_requests[0].ref;
    expect(view.reports).toHaveLength(1);
    await apply('return-R',{kind:'return_to_headquarters',actor:'R',authority_ref:ref('authority','KA-INITIAL')});
    await at(88000);
    await apply('new-position',{kind:'request_self_position',actor:'R',recipient:'HQ',method_ref:ref('method','self-position-registration'),authority_ref:ref('authority','KA-INITIAL')});
    await at(90000);
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    expect(view.actors[0].position).toMatchObject({point:[250,150],observed_at:0});
    await at(91000);
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    expect(view.actors[0].position).toMatchObject({point:[201.55,150],observed_at:90000,received_at:91000});
    await at(118000);
    await apply('old-position',{kind:'forward_position_report',actor:'R',recipient:'HQ',collection_request_ref:request,output_role:'collection_end_self_position',authority_ref:ref('authority','KA-INITIAL')});
    await at(120000);
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    expect(view.actors[0].position).toMatchObject({point:[201.55,150],observed_at:90000,received_at:91000});
    expect(view.reports.filter(report=>report.body.kind==='self_position')).toMatchObject([{ref:{id:'R-self-position-new'},observed_time:{value:90000},source_reported_time:{kind:'known',value:90000},body:{point:[201.55,150]}},{ref:{id:'R-self-position-old'},observed_time:{value:30000},generated_at:31000,source_reported_time:{kind:'known',value:31000},body:{point:[250,150]}}]);
    expect(view.source_relationships).toMatchObject({content_delivery_count:1,report_identity_count:1,global_independence:{kind:'unknown'}});
    const history40=await game.get_replay(view.run_id,40000),history92=await game.get_replay(view.run_id,92000);
    expect(await history40.get_view(view.run_id)).toMatchObject({reports:[{source_actor:'R',method:'limited-text-collection'}],actors:[{position:{point:[250,150],observed_at:0}},{id:'W'}]});
    const beforeLate=await history92.get_view(view.run_id);if(beforeLate.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    expect(beforeLate.reports).toHaveLength(2);
    const state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong state');
    expect(state.actors.R.position).toEqual([176.05,150]);expect(state.actors.R.energy_used_uj).toBe(302000000);expect(state.records).toHaveLength(1);
    expect(valid_response({request_id:'late-position',ok:true,view})).toBe(true);
    let transport:Transport|undefined;
    try{
      vi.stubGlobal('Worker',OwnedSourcePort);transport=new Transport();
      const pending=transport.request({kind:'current',run_id:view.run_id}),port=OwnedSourcePort.current,request_id=port.latest?.request_id;
      port.emit({request_id,ok:true,view});expect(await pending).toEqual({request_id,ok:true,view});
    }finally{transport?.close();vi.unstubAllGlobals();}
    for(const mutation of ['old-overrides-current','private-current','duplicate-message','future-return-ack']){
      const changed=structuredClone(view);
      if(mutation==='old-overrides-current')changed.actors[0].position={point:[250,150],observed_at:30000,received_at:120000,evidence:'R-self-position-old'};
      else if(mutation==='private-current')changed.actors[0].position={point:[176.05,150],observed_at:120000,received_at:120000,evidence:'private-world'};
      else if(mutation==='duplicate-message')changed.deliveries.push({...structuredClone(changed.deliveries[2]),ref:ref('delivery','invented-duplicate'),knowledge_seq:999});
      else changed.return_requests[0].acknowledgement!.received_at=200000;
      expect(valid_response({request_id:mutation,ok:true,view:changed}),mutation).toBe(false);
    }
  }finally{await store.delete();}
});

async function source_fixture(){
  const store=new Persistence('ka-owned-source-late-'+crypto.randomUUID()),game=new Game(store);
  let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref:'KA-SOURCE3-01'},'research','create');
  const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
  const at=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
  const apply=async(operation_id:string,intent:unknown)=>{const result=await game.apply_collection_intent({run_id:view.run_id,operation_id,expected_revision:view.revision,intent});view=result.view;return result;};
  for(const actor of ['R','W'] as const){
    if(actor==='W')await at(59000);
    await apply('collect-'+actor,{kind:'request_collection',actor,question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope',actor==='R'?'B-LIMITED':'B-QUALIFIED'),method_ref:ref('method',actor==='R'?'limited-text-collection':'qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-'+actor)],collection_window:actor==='R'?{from:1000,to:31000}:{from:60000,to:91000},needed_by:900000,...(actor==='R'?{delivery_copies:3}:{})});
  }
  await at(100000);
  await apply('read-defer',{kind:'request_archive_read',actor:'R',entry:'survey',method_ref:ref('method','B-archive-read'),authority_ref:ref('authority','KA-INITIAL'),forward_credentials:'defer'});
  await at(105000);
  return {store,game,ref,at,apply,get view(){return view;}};
}

test.each(['revocation','contradiction'])('KA-E16 applies a historical %s only after actual local read/registration and notice Delivery',async(entry)=>{
  const f=await source_fixture();
  try{
    if(f.view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    await f.at(120000);
    await f.apply('prove-three',{kind:'forward_source_credential',actor:'R',recipient:'HQ',reader_request_ref:f.view.archive_requests[0].ref,credential_roles:['pair-RW','pair-RS','pair-WS'],authority_ref:f.ref('authority','KA-INITIAL')});
    await f.at(124000);
    expect(f.view).toMatchObject({source_notices:[],source_relationships:{global_independence:{kind:'confirmed',count:3}}});
    const priorCredentials=structuredClone(f.view.source_credentials),oldReports=structuredClone(f.view.reports);
    await f.at(130000);
    await f.apply('read-notice',{kind:'request_archive_read',actor:'R',entry,method_ref:f.ref('method','B-archive-read'),authority_ref:f.ref('authority','KA-INITIAL'),forward_credentials:'defer'});
    await f.at(134000);expect(f.view).toMatchObject({source_notices:[],source_relationships:{global_independence:{kind:'confirmed',count:3}}});
    await f.at(135000);
    expect(f.view).toMatchObject({source_notices:[{notice:{kind:entry,issued_at:-10000,issuer:'scenario-source-registrar',credential_id:'pair-WS'},sent_at:134000,received_at:135000}],source_relationships:{global_independence:{kind:'unknown'},confirmed_pairs:[{status:'valid'},{status:'valid'},{status:'invalidated'}]}});
    expect(f.view.source_credentials).toEqual(priorCredentials);expect(f.view.reports).toEqual(oldReports);
    const historical=await f.game.get_replay(f.view.run_id,124000);
    expect(await historical.get_view(f.view.run_id)).toMatchObject({source_notices:[],source_relationships:{global_independence:{kind:'confirmed',count:3}}});
    const state=await f.store.read_committed(f.view.run_id);if(state?.schema!==14)throw Error('Wrong state');
    expect(state.actors.R.energy_used_uj).toBe(342000000);
    expect(valid_response({request_id:'historical-source-notice',ok:true,view:f.view})).toBe(true);
  }finally{await f.store.delete();}
});

test('KA-E15 later credential requests use real HQ/source service and leave earlier knowledge unchanged',async()=>{
  const f=await source_fixture();
  try{
    if(f.view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    const old=structuredClone(f.view.source_relationships),run=f.view.run_id;
    await f.at(120000);
    const intent={kind:'forward_source_credential',actor:'R',recipient:'HQ',reader_request_ref:f.view.archive_requests[0].ref,credential_roles:['pair-RW','pair-RS','pair-WS'],authority_ref:f.ref('authority','KA-INITIAL')};
    const envelope={run_id:run,operation_id:'late-credentials',expected_revision:f.view.revision,intent};
    const issued=await f.apply('late-credentials',intent);
    await f.at(121000);expect(f.view).toMatchObject({source_credentials:[],source_relationships:old});
    await f.at(123000);expect(f.view).toMatchObject({source_credentials:[{received_at:122000},{received_at:123000}],source_relationships:{global_independence:{kind:'unknown'}}});
    await f.at(124000);expect(f.view).toMatchObject({source_credentials:[{received_at:122000},{received_at:123000},{received_at:124000}],source_relationships:{global_independence:{kind:'confirmed',count:3}}});
    const committed=await f.store.read_committed(run);
    expect((await f.game.apply_collection_intent(envelope)).receipt).toEqual(issued.receipt);
    expect(await f.store.read_committed(run)).toEqual(committed);
    const history=await f.game.get_replay(run,105000);
    expect(await history.get_view(run)).toMatchObject({sim_time:105000,source_relationships:old,source_credentials:[]});
    const beforeW=await f.game.get_replay(run,92000);
    expect(await beforeW.get_view(run)).toMatchObject({sim_time:92000,source_relationships:{content_delivery_count:3,report_identity_count:1},facility_knowledge:null});
    expect(await f.store.read_committed(run)).toEqual(committed);
    expect(valid_response({request_id:'late-source-credentials',ok:true,view:f.view})).toBe(true);
  }finally{await f.store.delete();}
});

test.each(['missing_pair_WS','insufficient_scope_WS'])('KA-E15 keeps global independence unknown after an actual bounded archive read with %s',async(source_profile)=>{
  const store=new Persistence('ka-owned-source-unknown-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref:'KA-SOURCE3-01',source_profile},'research','create');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    const at=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    for(const actor of ['R','W'] as const){
      if(actor==='W')await at(59000);
      view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'collect-'+actor,expected_revision:view.revision,intent:{kind:'request_collection',actor,question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope',actor==='R'?'B-LIMITED':'B-QUALIFIED'),method_ref:ref('method',actor==='R'?'limited-text-collection':'qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-'+actor)],collection_window:actor==='R'?{from:1000,to:31000}:{from:60000,to:91000},needed_by:900000,...(actor==='R'?{delivery_copies:3}:{})}})).view;
    }
    await at(100000);
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'read-incomplete',expected_revision:view.revision,intent:{kind:'request_archive_read',actor:'R',entry:'survey',method_ref:ref('method','B-archive-read'),authority_ref:ref('authority','KA-INITIAL'),forward_credentials:'all'}})).view;
    await at(108000);
    expect(view).toMatchObject({source_relationships:{content_delivery_count:5,report_identity_count:3,global_independence:{kind:'unknown'},confirmed_pairs:[{credential_ref:{id:'pair-RW'}},{credential_ref:{id:'pair-RS'}}]}});
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong branch');
    expect(view.source_credentials).toHaveLength(source_profile==='missing_pair_WS'?2:3);
    expect(view.deliveries[4].archive_read_receipt?.available_credential_roles).toEqual(source_profile==='missing_pair_WS'?['pair-RW','pair-RS']:['pair-RW','pair-RS','pair-WS']);
    expect(valid_response({request_id:'incomplete-source',ok:true,view})).toBe(true);
  }finally{await store.delete();}
});

test('KA-E14 requires all three separately delivered pair credentials before confirming three independent sources',async()=>{
  const store=new Persistence('ka-owned-pair-source-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref:'KA-SOURCE3-01'},'research','create');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    const at=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    for(const actor of ['R','W'] as const){
      if(actor==='W')await at(59000);
      view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'collect-'+actor,expected_revision:view.revision,intent:{kind:'request_collection',actor,question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope',actor==='R'?'B-LIMITED':'B-QUALIFIED'),method_ref:ref('method',actor==='R'?'limited-text-collection':'qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-'+actor)],collection_window:actor==='R'?{from:1000,to:31000}:{from:60000,to:91000},needed_by:900000,...(actor==='R'?{delivery_copies:3}:{})}})).view;
    }
    await at(100000);
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'read-and-forward',expected_revision:view.revision,intent:{kind:'request_archive_read',actor:'R',entry:'survey',method_ref:ref('method','B-archive-read'),authority_ref:ref('authority','KA-INITIAL'),forward_credentials:'all'}})).view;
    await at(105000);
    expect(view).toMatchObject({source_relationships:{content_delivery_count:5,report_identity_count:3,confirmed_pairs:[],global_independence:{kind:'unknown'}},source_credentials:[]});
    await at(107000);
    expect(view).toMatchObject({source_relationships:{confirmed_pairs:[{credential_ref:{id:'pair-RW'}},{credential_ref:{id:'pair-RS'}}],global_independence:{kind:'unknown'}}});
    await at(108000);
    expect(view).toMatchObject({source_relationships:{content_delivery_count:5,report_identity_count:3,global_independence:{kind:'confirmed',count:3,scope:{id:'B',version:1}}},source_credentials:[{credential:{id:'pair-RW'},sent_at:105000,received_at:106000},{credential:{id:'pair-RS'},sent_at:106000,received_at:107000},{credential:{id:'pair-WS'},sent_at:107000,received_at:108000}]});
    expect(valid_response({request_id:'three-pairs',ok:true,view})).toBe(true);
  }finally{await store.delete();}
});

test('KA-E14 actually reads and registers the historical S original before its fifth content Delivery',async()=>{
  const store=new Persistence('ka-owned-historical-source-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref:'KA-SOURCE3-01'},'research','create');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    const collect=async(actor:'R'|'W')=>{view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'collect-'+actor,expected_revision:view.revision,intent:{kind:'request_collection',actor,question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope',actor==='R'?'B-LIMITED':'B-QUALIFIED'),method_ref:ref('method',actor==='R'?'limited-text-collection':'qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-'+actor)],collection_window:actor==='R'?{from:1000,to:31000}:{from:60000,to:91000},needed_by:900000,...(actor==='R'?{delivery_copies:3}:{})}})).view;};
    const at=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
    await collect('R');await at(59000);await collect('W');await at(100000);
    view=(await game.apply_collection_intent({run_id:view.run_id,operation_id:'read-S',expected_revision:view.revision,intent:{kind:'request_archive_read',actor:'R',entry:'survey',method_ref:ref('method','B-archive-read'),authority_ref:ref('authority','KA-INITIAL'),forward_credentials:'defer'}})).view;
    await at(104000);
    expect(view).toMatchObject({source_relationships:{content_delivery_count:4,report_identity_count:2,global_independence:{kind:'unknown'}}});
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong collection branch');
    expect(view.reports.some(report=>report.source_actor==='S')).toBe(false);
    await at(105000);
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong collection branch');
    expect(view.source_relationships).toMatchObject({content_delivery_count:5,report_identity_count:3,global_independence:{kind:'unknown'}});
    const historical=view.reports.find(report=>report.source_actor==='S');
    expect(historical).toMatchObject({method:'historical-survey-text',observed_time:{kind:'known',value:-60000},generated_at:-59000,record_ref:null,body:{kind:'historical_survey',quality:'limited'}});
    expect(view.deliveries[4]).toMatchObject({sender:'R',recipient:'HQ',sent_at:104000,received_at:105000,report_ref:historical!.ref});
    const state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong collection branch');
    expect(state.records).toHaveLength(2);
    expect(state.actors.R.energy_used_uj).toBe(276000000);
    expect(valid_response({request_id:'historical-S',ok:true,view})).toBe(true);
    const changed=structuredClone(view),forged=changed.reports.find(report=>report.method==='historical-survey-text');
    if(!forged||forged.method!=='historical-survey-text')throw Error('Missing history');
    forged.body.original.text='替换历史原件但保留原始digest';
    const {content_digest:_original,...content}=forged;forged.content_digest=await hash(canonical(content));
    expect(await verify_collection_report_digests(changed)).toBe(false);
  }finally{await store.delete();}
});

test('KA-E14 sends one original and two authorized copies through the same actual source FIFO without new records or roots',async()=>{
  const store=new Persistence('ka-owned-source-copies-'+crypto.randomUUID()),game=new Game(store);
  try{
    let view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref:'KA-SOURCE3-01'},'research','create');
    const ref=<K extends string>(kind:K,id:string)=>({run_id:view.run_id,kind,id,version:1 as const});
    const envelope={run_id:view.run_id,operation_id:'collect-three',expected_revision:view.revision,intent:{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000,delivery_copies:3}};
    const issued=await game.apply_collection_intent(envelope);view=issued.view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'three-deliveries',expected_revision:view.revision,intent:{kind:'advance',to:34000}})).view;
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong collection branch');
    expect(view.reports).toHaveLength(1);expect(view.coverage).toHaveLength(1);
    expect(view.deliveries.map(delivery=>[delivery.sent_at,delivery.received_at])).toEqual([[31000,32000],[32000,33000],[33000,34000]]);
    expect(new Set(view.deliveries.map(delivery=>delivery.ref.id)).size).toBe(3);
    expect(view.deliveries.every(delivery=>delivery.report_ref.id===view.reports[0].ref.id)).toBe(true);
    expect(view.reports[0]).toMatchObject({observed_time:{kind:'known',value:30000},generated_at:31000});
    expect(view.source_relationships).toMatchObject({content_delivery_count:3,report_identity_count:1,global_independence:{kind:'unknown'}});
    expect(valid_response({request_id:'three-copies',ok:true,view})).toBe(true);
    const state=await store.read_committed(view.run_id);if(state?.schema!==14)throw Error('Wrong collection branch');
    expect(state.source_messages.map(message=>[message.kind,message.sent_at,message.received_at])).toEqual([['accepted',1000,2000],['terminal',31000,32000],['forward',32000,33000],['forward',33000,34000]]);
    expect(state.records).toHaveLength(1);expect(state.actors.R).toMatchObject({energy_used_uj:128000000,blank_record:false});
    expect((await game.apply_collection_intent(envelope)).receipt).toEqual(issued.receipt);
    expect(await store.read_committed(view.run_id)).toEqual(state);
  }finally{await store.delete();}
});

test.each([{case_ref:null},{case_ref:[]},{case_ref:new String('KA-SOURCE3-01')}])('KA-E14 rejects a nonprimitive or invalid explicit case selector atomically: %j',async({case_ref})=>{
  const store=new Persistence('ka-owned-source-case-type-'+crypto.randomUUID()),game=new Game(store);
  try{
    await expect(game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref},'research','bad-source-case')).rejects.toThrow('INVALID_DEFINITION');
    expect(await store.list_runs()).toEqual([]);
  }finally{await store.delete();}
});

test('KA-E14 registers the bounded source-three case without preloading HQ reports or independence proof',async()=>{
  const store=new Persistence('ka-owned-source-case-'+crypto.randomUUID()),game=new Game(store);
  try{
    const selector={schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1},case_ref:'KA-SOURCE3-01'};
    const view=await game.create_run(selector,'research','create-source-case');
    expect(view).toMatchObject({scenario_kind:'play_knowledge_collection',case_ref:'KA-SOURCE3-01',reports:[],deliveries:[],source_relationships:{content_delivery_count:0,report_identity_count:0,global_independence:{kind:'unknown'},confirmed_pairs:[]}});
    expect(await game.create_run(selector,'research','create-source-case')).toEqual(view);
    await expect(game.create_run({...selector,case_ref:'unregistered-source-case'},'research','invalid-case')).rejects.toThrow('INVALID_DEFINITION');
    expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});
