import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import definition from '../src/core/mission-definition.json';
import {mission_draft,mission_variant} from './mission-fixtures';
import type {ConditionExpr,MissionTruth} from '../src/mission-contracts';
import type {SpatialScope} from '../src/spatial';

test('B22 a closed possible-position disk touching an isolated excluded union point is unknown',async()=>{
  const variant=await mission_variant(value=>{
    const base=value.catalogs.map.scopes.find(s=>s.id==='H')!;
    const outer:[number,number][]=[[50,130],[150,130],[150,170],[50,170],[50,130]];
    value.catalogs.map.scopes.push(
      {...base,id:'first-hole',kind:'area',typed_geometry:{outer,holes:[[[90,140],[100,140],[100,150],[90,150],[90,140]]]}},
      {...base,id:'second-hole',kind:'area',typed_geometry:{outer,holes:[[[100,150],[110,150],[110,160],[100,160],[100,150]]]}},
      {...base,id:'point-excluding-union',kind:'region_set',typed_geometry:{area_refs:['first-hole','second-hole']}},
      {...base,id:'touching-disk',kind:'point',typed_geometry:{position:[100,151]},uncertainty:{kind:'known',value:1,unit:'fictional_metre',evidence:'B22-INITIAL-POSITION'}}
    );
    value.catalogs.initial_evidence.scope_ref='touching-disk';
  }),store=new Persistence('b22-owned-t02-isolated-exclusion',[],[variant]);
  try{
    const game=new Game(store),view=await game.create_run(variant,'research','create'),draft=mission_draft(view.run_id);
    draft.phases[0].entry_gate={kind:'compare',field_ref:'position.scope',operator:'in',typed_value:'point-excluding-union'};
    expect((await game.preview_plan(view.run_id,view.revision,0,draft)).phases[0].gate.result).toBe('U');
    expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test('B22 equal observed point geometry with a different uncertainty proof keeps one position and both lawful proofs',async()=>{
  const variant=await mission_variant(value=>{
    value.catalogs.map.scopes.push({...value.catalogs.map.scopes.find(s=>s.id==='H')!,id:'same-point-other-proof',uncertainty:{kind:'known',value:0,unit:'fictional_metre',evidence:'same-point-report'}});
    value.catalogs.position_reports=[{id:'same-point-report',origin:'R',target:'HQ',scope_ref:'same-point-other-proof',observed:{kind:'known',value:0,evidence:'same-point-report'},source_event_time:{kind:'unknown'},reported_at:0,delivery_at:1000}];
  }),store=new Persistence('b22-owned-t02-same-shape-proof',[],[variant]);
  try{
    const game=new Game(store),initial=await game.create_run(variant,'research','create'),current=await game.control_clock({run_id:initial.run_id,operation_id:'deliver',expected_revision:1,intent:{kind:'advance',to:1000}});
    if(current.view.scenario_kind!=='play_mission')throw Error('Expected mission view');
    expect(current.view.position_knowledge).toMatchObject({status:'known_scope',scope:{kind:'point'},evidence_refs:['B22-INITIAL-POSITION','same-point-report']});
  }finally{await store.delete();}
});

test.each(['closed_tangent','internal_union_edge'] as const)('B22 a possible-position disk at %s is completely contained',async kind=>{
  const variant=await mission_variant(value=>{
    const base=value.catalogs.map.scopes.find(s=>s.id==='H')!;
    value.catalogs.map.scopes.push({...base,id:'boundary-disk',kind:'point',typed_geometry:{position:kind==='closed_tangent'?[100,150]:[150,150]},uncertainty:{kind:'known',value:kind==='closed_tangent'?10:1,unit:'fictional_metre',evidence:'B22-INITIAL-POSITION'}});
    value.catalogs.map.scopes.push({...base,id:'joined-corridors',kind:'region_set',typed_geometry:{area_refs:['HA-area','AB-area']}});value.catalogs.initial_evidence.scope_ref='boundary-disk';
  }),store=new Persistence('b22-owned-t02-closed-'+kind,[],[variant]);
  try{
    const game=new Game(store),view=await game.create_run(variant,'research','create'),draft=mission_draft(view.run_id);draft.phases[0].entry_gate={kind:'compare',field_ref:'position.scope',operator:'in',typed_value:kind==='closed_tangent'?'HA-area':'joined-corridors'};
    expect((await game.preview_plan(view.run_id,view.revision,0,draft)).phases[0].gate.result).toBe('T');
  }finally{await store.delete();}
});

test.each(['all','any'] as const)('B22 PG16 empty %s expression is rejected rather than defaulted true',async kind=>{
  const store=new Persistence('b22-owned-t02-empty-'+kind);
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create'),draft=mission_draft(view.run_id);draft.phases[0].entry_gate={kind,children:[]};
    await expect(game.preview_plan(view.run_id,view.revision,0,draft)).rejects.toThrow('INVALID_REQUEST');expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test('B22 canonical point equality compares the geometry instead of names',async()=>{
  const variant=await mission_variant(value=>{value.catalogs.map.scopes.push({...value.catalogs.map.scopes.find(s=>s.id==='H')!,id:'same-geometry-new-name'});value.catalogs.initial_evidence.scope_ref='same-geometry-new-name';}),store=new Persistence('b22-owned-t02-canonical-point',[],[variant]);
  try{
    const game=new Game(store),view=await game.create_run(variant,'research','create'),draft=mission_draft(view.run_id);draft.phases[0].entry_gate={kind:'compare',field_ref:'position.scope',operator:'eq',typed_value:'H'};
    expect((await game.preview_plan(view.run_id,view.revision,0,draft)).phases[0].gate.result).toBe('T');
  }finally{await store.delete();}
});

test.each([['all_inside','T'],['all_disjoint','F'],['mixed','U']] as const)('B22 PG16 delivered conflicting candidates remain %s: %s',async(kind,expected)=>{
  const variant=await mission_variant(value=>{
    value.catalogs.position_reports=[{id:'alternative-position',origin:'R',target:'HQ',scope_ref:'A',observed:{kind:'known',value:0,evidence:'alternative-position'},source_event_time:{kind:'unknown'},reported_at:0,delivery_at:1000}];
  }),store=new Persistence('b22-owned-t02-conflicting-'+kind,[],[variant]);
  try{
    const game=new Game(store),initial=await game.create_run(variant,'research','create'),draft=mission_draft(initial.run_id);
    const current=await game.control_clock({run_id:initial.run_id,operation_id:'deliver',expected_revision:1,intent:{kind:'advance',to:1000}});
    if(current.view.scenario_kind!=='play_mission')throw Error('Expected mission view');
    expect(current.view.position_knowledge.status).toBe('conflicting');
    draft.phases[0].entry_gate=kind==='all_inside'?{kind:'compare',field_ref:'position.scope',operator:'in',typed_value:'HA-area'}:{kind:'compare',field_ref:'position.scope',operator:'eq',typed_value:kind==='all_disjoint'?'B':'H'};
    expect((await game.preview_plan(initial.run_id,current.view.revision,0,draft)).phases[0].gate).toMatchObject({result:expected,evidence_refs:['B22-INITIAL-POSITION','alternative-position']});
  }finally{await store.delete();}
});

test('B22 PG14 actually delivered old position evidence retains observed0 and expires at5000',async()=>{
  const variant=await mission_variant(value=>{
    value.profile.parameters.position_max_age_ms=5000;value.profile.parameters.evidence_valid_until=9000;
    value.catalogs.initial_evidence.max_age_ms=5000;value.catalogs.initial_evidence.valid_until_time_ms=9000;
    Reflect.set(value.catalogs,'position_reports',[{id:'old-position-report',origin:'R',target:'HQ',scope_ref:'H',observed:{kind:'known',value:0,evidence:'old-position-report'},source_event_time:{kind:'unknown'},reported_at:0,delivery_at:4999}]);
  }),store=new Persistence('b22-owned-t02-late-position',[],[variant]);
  try{
    const game=new Game(store),initial=await game.create_run(variant,'research','create'),draft=mission_draft(initial.run_id);
    draft.phases[0].entry_gate={kind:'compare',field_ref:'position.scope',operator:'eq',typed_value:'H'};
    let current=await game.control_clock({run_id:initial.run_id,operation_id:'deliver',expected_revision:1,intent:{kind:'advance',to:4999}});
    if(current.view.scenario_kind!=='play_mission')throw Error('Expected mission view');
    expect(current.view.position_knowledge).toMatchObject({observed:{kind:'known',value:0},evidence_refs:['B22-INITIAL-POSITION','old-position-report']});
    expect((await game.preview_plan(initial.run_id,current.view.revision,0,draft)).phases[0].gate).toMatchObject({result:'T',expires_at_time_ms:{kind:'known',value:5000}});
    current=await game.control_clock({run_id:initial.run_id,operation_id:'expire',expected_revision:current.view.revision,intent:{kind:'advance',to:5000}});
    expect((await game.preview_plan(initial.run_id,current.view.revision,1,draft)).phases[0].gate.result).toBe('U');
  }finally{await store.delete();}
});

test.each(['future-report','unreceived-report','another-run-report','Q-private-report'])('B22 PG17 unavailable evidence %s is uniformly rejected before saving',async(ref)=>{
  const store=new Persistence('b22-owned-t02-illegal-'+ref);
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create'),draft=mission_draft(view.run_id);draft.evidence_refs=[ref];
    await expect(game.save_plan({run_id:view.run_id,operation_id:'save',expected_revision:1,intent:{kind:'save_plan',base_plan_ref:null,expected_object_revision:0,draft}})).rejects.toThrow('EVIDENCE_REQUIRED');
    expect(await game.get_view(view.run_id)).toEqual(view);
    expect(await game.get_receipt(view.run_id,'save')).toBeNull();
  }finally{await store.delete();}
});

test.each([
  ['inside_point','T'],['closed_boundary','T'],['disjoint_point','F'],['straddling_uncertainty','U'],['unknown_uncertainty','U'],
  ['inside_area','T'],['disjoint_area','F'],['straddling_area','U'],['hole_excluded','F'],['hole_spanned','U'],['hole_tangent','U'],['union_area','T'],['corridor_area','T'],['edge_area','T']
] as const)('B22 PG16 %s uses its entire possible position set: %s',async(kind,expected)=>{
  const variant=await mission_variant(value=>{
    const base=value.catalogs.map.scopes.find(s=>s.id==='H')!;
    const point=(position:[number,number],radius=0):SpatialScope=>({...base,id:'position-test',kind:'point',uncertainty:{kind:'known',value:radius,unit:'fictional_metre',evidence:'B22-INITIAL-POSITION'},typed_geometry:{position}});
    let scope:SpatialScope=point([100,150]);
    if(kind==='closed_boundary')scope=point([50,160]);
    if(kind==='disjoint_point')scope=point([100,180]);
    if(kind==='straddling_uncertainty')scope=point([100,160],3);
    if(kind==='unknown_uncertainty')scope={...point([100,150]),uncertainty:{kind:'unknown'}};
    const area=(outer:[number,number][]):SpatialScope=>({...base,id:'position-test',kind:'area',typed_geometry:{outer,holes:[]}});
    if(kind==='inside_area')scope=area([[60,145],[140,145],[140,155],[60,155],[60,145]]);
    if(kind==='disjoint_area')scope=area([[60,170],[140,170],[140,180],[60,180],[60,170]]);
    if(kind==='straddling_area')scope=area([[60,150],[140,150],[140,170],[60,170],[60,150]]);
    if(kind.startsWith('hole_')){
      value.catalogs.map.scopes.push({...base,id:'target-hole',kind:'area',typed_geometry:{outer:[[60,140],[140,140],[140,160],[60,160],[60,140]],holes:[[[90,145],[110,145],[110,155],[90,155],[90,145]]]}});
      scope=kind==='hole_spanned'?area([[70,142],[130,142],[130,158],[70,158],[70,142]]):kind==='hole_tangent'?point([85,150],5):point([100,150]);
    }
    if(kind==='union_area'){
      value.catalogs.map.scopes.push({...base,id:'joined-regions',kind:'region_set',typed_geometry:{area_refs:['HA-area','AB-area']}});
      scope=area([[100,145],[200,145],[200,155],[100,155],[100,145]]);
    }
    if(kind==='corridor_area')scope={...value.catalogs.map.scopes.find(s=>s.id==='HA')!,id:'position-test'};
    if(kind==='edge_area')scope={...base,id:'position-test',kind:'edge',typed_geometry:{line:[[60,150],[140,150]]}};
    value.catalogs.map.scopes.push(scope);value.catalogs.initial_evidence.scope_ref=scope.id;
  }),store=new Persistence('b22-owned-t02-geometry-'+kind,[],[variant]);
  try{
    const game=new Game(store),view=await game.create_run(variant,'research','create'),draft=mission_draft(view.run_id);
    draft.phases[0].entry_gate={kind:'compare',field_ref:'position.scope',operator:'in',typed_value:kind.startsWith('hole_')?'target-hole':kind==='union_area'?'joined-regions':'HA-area'};
    expect((await game.preview_plan(view.run_id,view.revision,0,draft)).phases[0].gate.result).toBe(expected);
    expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test('B22 a lawful area position is retained and fully contained without inventing a point',async()=>{
  const variant=await mission_variant(value=>{
    const area=value.catalogs.map.scopes.find(s=>s.kind==='area')!;
    value.catalogs.initial_evidence.scope_ref=area.id;
  }),store=new Persistence('b22-owned-t02-area-position',[],[variant]);
  try{
    const game=new Game(store),view=await game.create_run(variant,'research','create'),draft=mission_draft(view.run_id);
    if(view.scenario_kind!=='play_mission')throw Error('Expected mission view');
    expect(view.position_knowledge).toMatchObject({status:'known_scope',scope:{kind:'area'}});
    draft.phases[0].entry_gate={kind:'compare',field_ref:'position.scope',operator:'in',typed_value:variant.catalogs.initial_evidence.scope_ref};
    expect((await game.preview_plan(view.run_id,view.revision,0,draft)).phases[0].gate.result).toBe('T');
  }finally{await store.delete();}
});

test('B22 a phase is unconfirmed before any matching delivered phase proof',async()=>{
  const store=new Persistence('b22-owned-t02-phase-unconfirmed');
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create'),draft=mission_draft(view.run_id);
    draft.phases[0].entry_gate={kind:'compare',field_ref:'phase.confirmed',operator:'eq',typed_value:true};
    expect((await game.preview_plan(view.run_id,view.revision,0,draft)).phases[0].gate).toMatchObject({result:'F',evidence_refs:[],expires_at_time_ms:{kind:'timeless'}});
  }finally{await store.delete();}
});

test('B22 a route permission gate uses the complete registered public path',async()=>{
  const store=new Persistence('b22-owned-t02-route-permission');
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create'),draft=mission_draft(view.run_id);
    draft.phases[0].entry_gate={kind:'compare',field_ref:'route.permitted',operator:'eq',typed_value:true};
    const preview=await game.preview_plan(view.run_id,view.revision,0,draft);
    expect(preview.phases[0].gate).toMatchObject({result:'T',expires_at_time_ms:{kind:'timeless'}});
    draft.routes[0].path=[[50,150],[100,180],[150,150]];
    expect((await game.preview_plan(view.run_id,view.revision,1,draft)).phases[0].gate.result).toBe('F');
    expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

const truth_cases=[
  ['all','T','T','T'],['all','T','F','F'],['all','T','U','U'],['all','F','T','F'],['all','F','F','F'],['all','F','U','F'],['all','U','T','U'],['all','U','F','F'],['all','U','U','U'],
  ['any','T','T','T'],['any','T','F','T'],['any','T','U','T'],['any','F','T','T'],['any','F','F','F'],['any','F','U','U'],['any','U','T','T'],['any','U','F','U'],['any','U','U','U']
] as const;
test.each(truth_cases)('B22 PG16 literal %s(%s,%s)=%s through the public preview',async(kind,a,b,expected)=>{
  const variant=await mission_variant(value=>{value.catalogs.initial_evidence.observed={kind:'unknown'};}),store=new Persistence('b22-owned-t02-truth-'+kind+a+b,[],[variant]);
  try{
    const game=new Game(store),view=await game.create_run(variant,'research','create'),draft=mission_draft(view.run_id);
    const facts:Record<MissionTruth,ConditionExpr>={T:{kind:'compare',field_ref:'capability.ready',operator:'eq',typed_value:true},F:{kind:'compare',field_ref:'capability.ready',operator:'ne',typed_value:true},U:{kind:'compare',field_ref:'position.scope',operator:'eq',typed_value:'H'}};
    draft.phases[0].entry_gate={kind,children:[facts[a],facts[b]]};
    const preview=await game.preview_plan(view.run_id,view.revision,0,draft);
    expect(preview.phases[0].gate.result).toBe(expected);expect(preview.phases[0].gate.conditions).toHaveLength(2);
  }finally{await store.delete();}
});
test.each([['T','F'],['F','T'],['U','U']] as const)('B22 PG16 literal not(%s)=%s preserves unknown',async(value,expected)=>{
  const variant=await mission_variant(v=>{v.catalogs.initial_evidence.observed={kind:'unknown'};}),store=new Persistence('b22-owned-t02-not-'+value,[],[variant]);
  try{
    const game=new Game(store),view=await game.create_run(variant,'research','create'),draft=mission_draft(view.run_id);
    const facts:Record<MissionTruth,ConditionExpr>={T:{kind:'compare',field_ref:'capability.ready',operator:'eq',typed_value:true},F:{kind:'compare',field_ref:'capability.ready',operator:'ne',typed_value:true},U:{kind:'compare',field_ref:'position.scope',operator:'eq',typed_value:'H'}};
    draft.phases[0].entry_gate={kind:'not',child:facts[value]};
    expect((await game.preview_plan(view.run_id,view.revision,0,draft)).phases[0].gate.result).toBe(expected);
  }finally{await store.delete();}
});

test('B22 HQ entry gate identifies its actual capability proof and knowledge revision',async()=>{
  const store=new Persistence('b22-owned-t02-entry-normal');
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create');
    const preview=await game.preview_plan(view.run_id,view.revision,0,mission_draft(view.run_id));
    expect(preview.phases[0]).toMatchObject({gate:{gate_id:'P1-entry',rule_version:'b22-mission-1',evaluated_by:'HQ',knowledge_revision:1,evaluated_at_time_ms:0,result:'T',evidence_refs:['B22-INITIAL-CAPABILITY'],expires_at_time_ms:{kind:'timeless'}}});
    expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test.each([[4999,'T'],[5000,'U'],[5001,'U']] as const)('B22 PG14 observed0 with age5000 at %i has literal result %s',async(at,expected)=>{
  const variant=await mission_variant(value=>{
    value.profile.parameters.position_max_age_ms=5000;value.profile.parameters.evidence_valid_until=9000;
    value.catalogs.initial_evidence.max_age_ms=5000;value.catalogs.initial_evidence.valid_until_time_ms=9000;
  }),store=new Persistence('b22-owned-t02-expiry-'+at,[],[variant]);
  try{
    const game=new Game(store),initial=await game.create_run(variant,'research','create');
    const advanced=await game.control_clock({run_id:initial.run_id,operation_id:'advance',expected_revision:1,intent:{kind:'advance',to:at}}),draft=mission_draft(initial.run_id);
    draft.phases[0].latest_finish_time_ms=100000;draft.phases[0].entry_gate={kind:'compare',field_ref:'position.scope',operator:'eq',typed_value:'H'};
    const preview=await game.preview_plan(initial.run_id,advanced.view.revision,0,draft);
    expect(preview.phases[0].gate).toMatchObject({result:expected,evaluated_at_time_ms:at,expires_at_time_ms:{kind:'known',value:5000},evidence_refs:['B22-INITIAL-POSITION']});
  }finally{await store.delete();}
});

test('B22 PG15 unknown observed is a valid typed registered fact and never becomes time zero',async()=>{
  const variant=await mission_variant(value=>{value.catalogs.initial_evidence.observed={kind:'unknown'};value.catalogs.initial_evidence.source_event_time={kind:'known',value:0,evidence:'B22-INITIAL-POSITION'};}),store=new Persistence('b22-owned-t02-unknown-observed',[],[variant]);
  try{
    const game=new Game(store),view=await game.create_run(variant,'research','create'),draft=mission_draft(view.run_id);
    draft.phases[0].entry_gate={kind:'compare',field_ref:'position.scope',operator:'eq',typed_value:'H'};
    const preview=await game.preview_plan(view.run_id,view.revision,0,draft);
    expect(preview.phases[0].gate).toMatchObject({result:'U',expires_at_time_ms:{kind:'unknown'},evidence_refs:['B22-INITIAL-POSITION']});
    if(view.scenario_kind!=='play_mission')throw Error('Expected mission view');
    if(view.position_knowledge.status!=='known_scope')throw Error('Expected the registered initial scope');
    expect(view.position_knowledge.observed).toEqual({kind:'unknown'});
    expect(view.position_knowledge.source_event_time).toEqual({kind:'known',value:0,evidence:'B22-INITIAL-POSITION'});
  }finally{await store.delete();}
});

test('B22 a position gate compares the lawful point geometry and records its real expiry',async()=>{
  const store=new Persistence('b22-owned-t02-position-gate');
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','create'),draft=mission_draft(view.run_id);
    draft.phases[0].entry_gate={kind:'compare',field_ref:'position.scope',operator:'eq',typed_value:'H'};
    const preview=await game.preview_plan(view.run_id,view.revision,0,draft);
    expect(preview.phases[0]).toMatchObject({gate:{result:'T',evidence_refs:['B22-INITIAL-POSITION'],expires_at_time_ms:{kind:'known',value:900000}}});
    expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});
