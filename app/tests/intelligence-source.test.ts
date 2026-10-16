import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {intelligence_definition,intelligence_variant} from './intelligence-fixtures';

test('B23 E01 a new intelligence run exposes only initial HQ knowledge and no unreceived source',async()=>{
  const definition=await intelligence_definition(),store=new Persistence('b23-owned-t01-e01');
  try{
    const game=new Game(store),view=await game.create_run(definition,'research','b23-create');
    expect(view).toMatchObject({scenario_kind:'play_intelligence',sim_time:0,paused:true,access:{blue:'unverified',green:'unverified'},received_reports:[],source_groups:[]});
    expect(JSON.stringify(view)).not.toContain('actual_access');
    expect(JSON.stringify(view)).not.toContain('ArchiveSource');
    expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test('B23 E02 delayed forwarding never rewrites the original observed or published time',async()=>{
  const definition=await intelligence_variant(d=>{for(const f of d.catalogs.forwardings)f.received+=20000;}),store=new Persistence('b23-owned-t01-r1-late',[],[],[definition]);
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create');
    const {view}=await game.control_clock({run_id:initial.run_id,operation_id:'late-delivery',expected_revision:1,intent:{kind:'advance',to:41000}});
    expect(Reflect.get(view,'received_reports')).toMatchObject([{report:{id:'R1',observed:{kind:'known',value:10000},source_published:20000,source_event_time:{kind:'unknown'}},delivery:{received:41000,sent:40000}}]);
  }finally{await store.delete();}
});

test('B23 E03 received forward-of evidence groups the original without certifying origin or independence',async()=>{
  const store=new Persistence('b23-owned-t01-e03');
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create');
    const {view}=await game.control_clock({run_id:initial.run_id,operation_id:'three',expected_revision:1,intent:{kind:'advance',to:41000}});
    expect(view).toMatchObject({source_groups:[{report_ref:{run_id:initial.run_id,kind:'report',id:'R1',version:1},delivery_refs:['D1','D2','D3'],relation:'confirmed_common_original',origin_attribution:{kind:'unknown'},independent_evidence_count:{kind:'unknown'}}]});
  }finally{await store.delete();}
});

test.each(['missing','future','same_text_new_original'] as const)('B23 E04 %s does not invent a confirmed lineage or independent count',async variant=>{
  const definition=await intelligence_variant(value=>{
    for(const forwarding of value.catalogs.forwardings){
      if(variant==='missing')Reflect.set(forwarding,'proof',null);
      if(variant==='future')Reflect.set(forwarding,'proof_received',51000);
      if(variant==='same_text_new_original'){Reflect.set(forwarding,'report_id','original-'+forwarding.id);Reflect.set(forwarding,'proof',null);}
    }
  }),store=new Persistence('b23-owned-t01-e04-'+variant,[],[],[definition]);
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create');
    const result=await game.control_clock({run_id:initial.run_id,operation_id:'three',expected_revision:1,intent:{kind:'advance',to:41000}});
    const groups=Reflect.get(result.view,'source_groups');expect(groups).toHaveLength(variant==='same_text_new_original'?3:1);
    for(const group of groups)expect(group).toMatchObject({relation:'unknown',lineage_links:[],independent_evidence_count:{kind:'unknown'}});
  }finally{await store.delete();}
});

test('B23 E04 a later lineage credential affects current knowledge but never the earlier committed node',async()=>{
  const definition=await intelligence_variant(d=>{for(const f of d.catalogs.forwardings)Reflect.set(f,'proof_received',51000);}),store=new Persistence('b23-owned-t01-e04-late',[],[],[definition]);
  try{
    const game=new Game(store),initial=await game.create_run(definition,'research','create');
    const earlier=await game.control_clock({run_id:initial.run_id,operation_id:'before-proof',expected_revision:1,intent:{kind:'advance',to:41000}});
    expect(Reflect.get(earlier.view,'source_groups')[0]).toMatchObject({relation:'unknown',lineage_links:[]});
    const now=await game.control_clock({run_id:initial.run_id,operation_id:'proof-arrival',expected_revision:earlier.view.revision,intent:{kind:'advance',to:51000}});
    expect(Reflect.get(now.view,'source_groups')[0]).toMatchObject({relation:'confirmed_common_original',lineage_links:[{received:51000},{received:51000},{received:51000}],independent_evidence_count:{kind:'unknown'}});
    const old=await (await game.get_replay(initial.run_id,41000,earlier.view.revision)).get_view(initial.run_id);
    expect(Reflect.get(old,'source_groups')[0]).toMatchObject({relation:'unknown',lineage_links:[]});
  }finally{await store.delete();}
});

test('B23 E02 three received deliveries preserve one original and its unknown source time',async()=>{
  const definition=await intelligence_definition(),store=new Persistence('b23-owned-t01-e02');
  try{
    const game=new Game(store);let view=await game.create_run(definition,'research','b23-create');
    for(const [to,count] of [[21000,1],[31000,2],[41000,3]]){
      const result=await game.control_clock({run_id:view.run_id,operation_id:'advance-'+to,expected_revision:view.revision,intent:{kind:'advance',to}});view=result.view;
      expect(view).toMatchObject({received_reports:Array.from({length:count},(_,i)=>({report:{id:'R1',version:1,source_event_time:{kind:'unknown'},observed:{kind:'known',value:10000},source_published:20000},delivery:{id:'D'+(i+1),received:[21000,31000,41000][i]}}))});
      expect(new Set((view as unknown as {received_reports:Array<{report:{id:string}}>}).received_reports.map(x=>x.report.id)).size).toBe(1);
    }
  }finally{await store.delete();}
});
