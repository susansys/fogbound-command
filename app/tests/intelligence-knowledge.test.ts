import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {intelligence_definition,intelligence_variant} from './intelligence-fixtures';

test('B23 initial public B repair requirement is explicit and does not imply private access verification',async()=>{
  const store=new Persistence('b23-owned-initial-B-repair');
  try{
    const game=new Game(store),view=await game.create_run(await intelligence_definition(),'research','create');
    expect(view).toMatchObject({repair_condition:{site:'B',status:'required',confirmed_at:0,evidence_ref:'B23-INITIAL-B-REPAIR'},access:{blue:'unverified',green:'unverified'},received_reports:[]});
  }finally{await store.delete();}
});

test('B23 E07 source performs its complete two-work recipe before publication and HQ receives it later',async()=>{
  const store=new Persistence('b23-owned-t01-e07');
  try{
    const game=new Game(store);let view=await game.create_run(await intelligence_definition(),'research','create');
    for(const to of [64999,65001,84999,85000,86000]){
      ({view}=await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}}));
      const local=await game.get_actor_view(view.run_id,'ArchiveSource');
      if(to===64999)expect(local).toMatchObject({work:{status:'pending',done_ms:0},resources:{energy:20,durability:100,packs:1}});
      if(to===65001)expect(local).toMatchObject({work:{status:'running',done_ms:1},resources:{energy:20,durability:97,packs:1,energy_reserved:4,packs_reserved:1}});
      if(to===84999)expect(local).toMatchObject({work:{status:'running',done_ms:19999},published_reports:[]});
      if(to>=85000)expect(local).toMatchObject({work:{status:'completed',done_ms:20000},resources:{energy:16,durability:97,packs:0,energy_reserved:0,packs_reserved:0},published_reports:[{id:'R3',source_published:85000,typed_payload:{kind:'access',value:'green'}}]});
      const received=Reflect.get(view,'received_reports');expect(received.filter((x:{report:{id:string}})=>x.report.id==='R3')).toHaveLength(to<86000?0:1);
      // Only headquarters' own processing desk may expose its new reservation.
      // Source-local reservations must remain absent from every other HQ field.
      const withoutOwnDesk=Object.fromEntries(Object.entries(view).filter(([key])=>key!=='processing'));
      expect(JSON.stringify(withoutOwnDesk)).not.toContain('energy_reserved');
      expect(JSON.stringify(view)).not.toContain('packs_reserved');
      expect(JSON.stringify(local)).not.toContain('fixed_terminal_energy');
    }
    expect(view).toMatchObject({access:{green:'unverified'},source_groups:[{independent_evidence_count:{kind:'unknown'}},{independent_evidence_count:{kind:'unknown'}}]});
  }finally{await store.delete();}
});

test('B23 E01 private access variants keep HQ, R and W knowledge and public failures identical before receipt',async()=>{
  const observations=[];
  for(const actual of ['blue','green']){
    const definition=await intelligence_variant(d=>{d.catalogs.engine_conditions.actual_access=actual;}),store=new Persistence('b23-owned-e01-private-'+actual,[],[],[definition]);
    try{
      const game=new Game(store);let view=await game.create_run(definition,'research','create');
      const normalize=(v:unknown)=>JSON.stringify(v).replaceAll(view.run_id,'<run>');
      const frames=[];
      for(const to of [0,20000,21000]){
        if(to)({view}=await game.control_clock({run_id:view.run_id,operation_id:'at-'+to,expected_revision:view.revision,intent:{kind:'advance',to}}));
        const r=await game.get_actor_view(view.run_id,'R'),w=await game.get_actor_view(view.run_id,'W');
        expect(r).toMatchObject({actor:'R',known_reports:[]});expect(w).toMatchObject({actor:'W',known_reports:[]});
        await expect(game.preview_plan(view.run_id,view.revision,0)).rejects.toThrow('INVALID_REQUEST');
        frames.push([normalize(view),normalize(r),normalize(w)]);
      }
      observations.push(frames);
      ({view}=await game.control_clock({run_id:view.run_id,operation_id:'actual-collection',expected_revision:view.revision,intent:{kind:'advance',to:86000}}));
      const localSource=await game.get_actor_view(view.run_id,'ArchiveSource');expect(localSource.published_reports).toMatchObject([{typed_payload:{value:actual}}]);
    }finally{await store.delete();}
  }
  expect(observations[0]).toEqual(observations[1]);
});

test('B23 E05 the received signed green original remains unverified and does not prove two independent sources',async()=>{
  const store=new Persistence('b23-owned-t01-e05');
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create');
    const {view}=await game.control_clock({run_id:initial.run_id,operation_id:'receive-green',expected_revision:1,intent:{kind:'advance',to:86000}});
    expect(view).toMatchObject({access:{blue:'unverified',green:'unverified'},source_groups:[{origin_attribution:{kind:'unknown'},independent_evidence_count:{kind:'unknown'}},{origin_attribution:{kind:'unknown'},independent_evidence_count:{kind:'unknown'}}]});
    const records=Reflect.get(view,'received_reports');expect(records[3]).toMatchObject({report:{id:'R3',origin:{kind:'known',actor:'ArchiveSource'},typed_payload:{kind:'access',value:'green'},claimed_confirmation:'unverified'},delivery:{received:86000,forward_of:null}});
  }finally{await store.delete();}
});
