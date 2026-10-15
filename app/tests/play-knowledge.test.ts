import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {play_variant} from './play-fixtures';
import {valid_response} from '../src/dto';
import {load_definition} from '../src/core/scenario';

test('PG13 registered delayed position payloads retain originals but never roll back a newer legal observation',async()=>{
  const catalog=[
    {id:'position-A',scope_ref:'A',observed:{kind:'known',value:1000,evidence:'observation-A'},reported_at:1000,delivery_at:2000,source_event_time:{kind:'unknown'}},
    {id:'position-B',scope_ref:'B',observed:{kind:'known',value:2000,evidence:'observation-B'},reported_at:2000,delivery_at:3000,source_event_time:{kind:'unknown'}},
    {id:'late-A',scope_ref:'A',observed:{kind:'known',value:1500,evidence:'observation-late-A'},reported_at:2500,delivery_at:4000,source_event_time:{kind:'unknown'}}
  ];
  const definition=await play_variant(v=>{Reflect.set(v.catalogs,'position_reports',catalog);}),store=new Persistence('b21-owned-knowledge-late',[definition]),game=new Game(store);
  try{
    const initial=await game.create_run(definition,'research','create-delayed-fixes');
    async function advance(to:number){const v=await game.get_view(initial.run_id);return (await game.control_clock({run_id:v.run_id,operation_id:'to-'+to,expected_revision:v.revision,intent:{kind:'advance',to}})).view;}
    expect(await advance(2000)).toMatchObject({position_knowledge:{scope:{typed_geometry:{position:[150,150]}},observed:{kind:'known',value:1000},reported:{kind:'known',value:1000},received:2000}});
    const newer=await advance(3000);expect(newer).toMatchObject({position_knowledge:{scope:{typed_geometry:{position:[250,150]}},observed:{kind:'known',value:2000},received:3000}});
    const late=await advance(4000);if(late.scenario_kind!=='play_corridor'||newer.scenario_kind!=='play_corridor')throw Error('Expected corridor');expect(late.position_knowledge).toEqual(newer.position_knowledge);
    expect(late.received_reports).toHaveLength(3);expect(late.received_reports[2]).toMatchObject({report:{observed:{kind:'known',value:1500},reported:{kind:'known',value:2500}},delivery:{received:{value:4000}}});
    expect(late.resources).toMatchObject({equipment_energy:13,equipment_wear:97});expect(valid_response({request_id:'late-fix',ok:true,view:late})).toBe(true);
    expect(await store.read_committed(initial.run_id)).toMatchObject({world:{position:{x:{n:'50',d:'1'},y:{n:'150',d:'1'}}}});
  }finally{await store.delete();}
});

test('PG13 equal observation scopes conflict, equivalent geometry merges evidence and unknown time cannot select a winner',async()=>{
  const catalog=[
    {id:'equal-A',scope_ref:'A',observed:{kind:'known',value:1000,evidence:'equal-A'},reported_at:1000,delivery_at:2000,source_event_time:{kind:'unknown'}},
    {id:'equal-B',scope_ref:'B',observed:{kind:'known',value:1000,evidence:'equal-B'},reported_at:2000,delivery_at:3000,source_event_time:{kind:'unknown'}},
    {id:'same-B',scope_ref:'B',observed:{kind:'known',value:1000,evidence:'same-B'},reported_at:3000,delivery_at:4000,source_event_time:{kind:'unknown'}},
    {id:'unknown-H',scope_ref:'H',observed:{kind:'unknown'},reported_at:4000,delivery_at:5000,source_event_time:{kind:'unknown'}},
    {id:'newer-H',scope_ref:'H',observed:{kind:'known',value:5000,evidence:'newer-H'},reported_at:5000,delivery_at:6000,source_event_time:{kind:'unknown'}}
  ];
  const definition=await play_variant(v=>{Reflect.set(v.catalogs,'position_reports',catalog);}),store=new Persistence('b21-owned-knowledge-conflict',[definition]),game=new Game(store);
  try{
    const initial=await game.create_run(definition,'research','create-conflicts');
    async function advance(to:number){const v=await game.get_view(initial.run_id);return (await game.control_clock({run_id:v.run_id,operation_id:'to-'+to,expected_revision:v.revision,intent:{kind:'advance',to}})).view;}
    const conflict=await advance(3000);if(conflict.scenario_kind!=='play_corridor')throw Error('Expected corridor');
    expect(conflict).toMatchObject({can_issue:false,position_knowledge:{status:'conflicting',observed:{value:1000},candidates:[{scope:{typed_geometry:{position:[150,150]}}},{scope:{typed_geometry:{position:[250,150]}}}]}});
    expect(conflict.position_knowledge).not.toHaveProperty('scope');expect(valid_response({request_id:'conflict',ok:true,view:conflict})).toBe(true);
    const merged=await advance(4000);if(merged.scenario_kind!=='play_corridor'||merged.position_knowledge.status!=='conflicting')throw Error('Expected conflict');
    expect(merged.position_knowledge.candidates).toHaveLength(2);expect(merged.position_knowledge.candidates[1].evidence_refs).toEqual(expect.arrayContaining(['b21-position-2','b21-position-3']));
    const unknown=await advance(5000);if(unknown.scenario_kind!=='play_corridor')throw Error('Expected corridor');expect(unknown.position_knowledge).toEqual(merged.position_knowledge);expect(unknown.received_reports.at(-1)?.report.observed).toEqual({kind:'unknown'});
    const newer=await advance(6000);expect(newer).toMatchObject({can_issue:true,position_knowledge:{status:'known_scope',scope:{typed_geometry:{position:[50,150]}},observed:{kind:'known',value:5000},received:6000}});
    if(newer.scenario_kind!=='play_corridor')throw Error('Expected corridor');expect(newer.received_reports).toHaveLength(5);expect(valid_response({request_id:'newer',ok:true,view:newer})).toBe(true);
  }finally{await store.delete();}
});

test('PG13 an equal-time conflict preserves registered initial provenance without inventing an initial Report or Delivery',async()=>{
  const definition=await play_variant(v=>{v.catalogs.position_reports=[{id:'conflict-at-origin',scope_ref:'B',observed:{kind:'known',value:0,evidence:'different-zero-observation'},reported_at:1000,delivery_at:2000,source_event_time:{kind:'unknown'}}];});
  const store=new Persistence('b21-owned-knowledge-initial-conflict',[definition]),game=new Game(store);
  try{
    const initial=await game.create_run(definition,'research','initial-conflict');const result=await game.control_clock({run_id:initial.run_id,operation_id:'read-conflict',expected_revision:1,intent:{kind:'advance',to:2000}});
    expect(result.view).toMatchObject({position_knowledge:{status:'conflicting',candidates:[{received:null,provenance:{kind:'registered_initial',initial_evidence_ref:'B21-INITIAL-POSITION'}},{received:2000,provenance:{kind:'delivered'}}]}});
    if(result.view.scenario_kind!=='play_corridor')throw Error('Expected corridor');expect(result.view.received_reports).toHaveLength(1);expect(valid_response({request_id:'initial-conflict',ok:true,view:result.view})).toBe(true);
  }finally{await store.delete();}
});

test('PG13 equal public point geometry with different scope IDs merges references rather than inventing a conflict',async()=>{
  const definition=await play_variant(v=>{
    const a=v.catalogs.map.scopes.find(s=>s.id==='A');if(a?.kind!=='point')throw Error('Expected A');v.catalogs.map.scopes.push({...structuredClone(a),id:'alias-A'});
    v.catalogs.position_reports=[
      {id:'same-geometry-one',scope_ref:'A',observed:{kind:'known',value:1000,evidence:'one'},reported_at:1000,delivery_at:2000,source_event_time:{kind:'unknown'}},
      {id:'same-geometry-two',scope_ref:'alias-A',observed:{kind:'known',value:1000,evidence:'two'},reported_at:2000,delivery_at:3000,source_event_time:{kind:'unknown'}}
    ];
  },true),store=new Persistence('b21-owned-knowledge-geometry',[definition]),game=new Game(store);
  try{
    const initial=await game.create_run(definition,'research','same-geometry'),result=await game.control_clock({run_id:initial.run_id,operation_id:'read-same-geometry',expected_revision:1,intent:{kind:'advance',to:3000}});
    expect(result.view).toMatchObject({position_knowledge:{status:'known_scope',scope:{id:'A',typed_geometry:{position:[150,150]}},evidence_refs:['b21-position-1','b21-position-2']}});expect(valid_response({request_id:'same-geometry',ok:true,view:result.view})).toBe(true);
  }finally{await store.delete();}
});

test('PG13 malformed or over-budget registered position catalogs reject before any run or operation exists',async()=>{
  for(const change of [
    (v:Parameters<Parameters<typeof play_variant>[0]>[0])=>{v.catalogs.position_reports.push(structuredClone(v.catalogs.position_reports[0]));},
    (v:Parameters<Parameters<typeof play_variant>[0]>[0])=>{v.catalogs.position_reports[0].scope_ref='missing-scope';},
    (v:Parameters<Parameters<typeof play_variant>[0]>[0])=>{v.catalogs.position_reports[0].observed={kind:'unknown'};Reflect.set(v.catalogs.position_reports[0].observed,'value',0);},
    (v:Parameters<Parameters<typeof play_variant>[0]>[0])=>{v.catalogs.position_reports[0].observed={kind:'known',value:1001,evidence:'future-observation'};},
    (v:Parameters<Parameters<typeof play_variant>[0]>[0])=>{v.catalogs.position_reports[0].delivery_at=1999;},
    (v:Parameters<Parameters<typeof play_variant>[0]>[0])=>{Reflect.set(v.catalogs.position_reports[0],'private_claim','injected');},
    (v:Parameters<Parameters<typeof play_variant>[0]>[0])=>{v.catalogs.position_reports=Array.from({length:33},(_,i)=>({...v.catalogs.position_reports[0],id:'position-'+i}));}
  ]){
    const definition=await play_variant(v=>{v.catalogs.position_reports=[{id:'bounded-position',scope_ref:'A',observed:{kind:'known',value:1000,evidence:'known-observation'},reported_at:1000,delivery_at:2000,source_event_time:{kind:'unknown'}}];change(v);}),store=new Persistence('b21-owned-knowledge-invalid',[definition]);
    try{await expect(new Game(store).create_run(definition,'research','bad-position-catalog')).rejects.toThrow('INVALID_DEFINITION');expect(await store.list_runs()).toEqual([]);expect(await store.creation('bad-position-catalog')).toBeUndefined();}finally{await store.delete();}
  }
});
