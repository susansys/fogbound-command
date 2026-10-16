import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {intelligence_definition} from './intelligence-fixtures';

test('B23 E29 one large advance and small boundary steps generate identical artifact, resources and reports',async()=>{
  const outcomes=[];
  for(const chunked of [false,true]){
    const store=new Persistence('b23-owned-t03-chunks-'+chunked);
    try{
      const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});let revision=1;
      const issue=async(id:string)=>{revision=(await game.issue_activity({run_id:initial.run_id,operation_id:id,expected_revision:revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity',id),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}})).view.revision;};
      const advance=async(to:number)=>{const r=await game.control_clock({run_id:initial.run_id,operation_id:'at-'+to,expected_revision:revision,intent:{kind:'advance',to}});revision=r.view.revision;return r.view;};
      await issue('R-to-A');if(chunked)for(const t of [1000,2000,10000,30499])await advance(t);await advance(32000);await issue('A-record');
      if(chunked)for(const t of [33000,38000,38001,55000,77999,78000])await advance(t);const view=await advance(79000),local=await game.get_actor_view(initial.run_id,'R');
      expect(local).toMatchObject({resources:{record_energy:16,record_packs:1,durability:97,link_energy:12},artifacts:[{created_at:78000}]});
      outcomes.push(JSON.stringify({local,actors:Reflect.get(view,'actors'),field_reports:Reflect.get(view,'field_reports'),artifact_reports:Reflect.get(view,'artifact_reports')}).replaceAll(initial.run_id,'<run>'));
    }finally{await store.delete();}
  }
  expect(outcomes[0]).toEqual(outcomes[1]);
});

test('B23 E29 actual owned transaction abort rolls back artifact, terminal report and all field consumption; original operation retries once',async()=>{
  const store=new Persistence('b23-owned-t03-atomic-artifact'),native=IDBObjectStore.prototype.put;
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});let revision=1;
    const issue=async(id:string)=>{revision=(await game.issue_activity({run_id:initial.run_id,operation_id:id,expected_revision:revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity',id),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}})).view.revision;};
    await issue('R-to-A');revision=(await game.control_clock({run_id:initial.run_id,operation_id:'arrive',expected_revision:revision,intent:{kind:'advance',to:32000}})).view.revision;await issue('A-record');
    const before=(await game.control_clock({run_id:initial.run_id,operation_id:'partial',expected_revision:revision,intent:{kind:'advance',to:58000}})).view,local=await game.get_actor_view(initial.run_id,'R');
    const envelope={run_id:initial.run_id,operation_id:'complete-and-receive',expected_revision:before.revision,intent:{kind:'advance' as const,to:79000}};let aborted=false;
    IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){const request=native.apply(this,args);if(!aborted&&this.transaction.db.name===store.name&&this.name==='runs')request.addEventListener('success',()=>{aborted=true;this.transaction.abort();},{once:true});return request;};
    await expect(game.control_clock(envelope)).rejects.toThrow('STORAGE_UNCONFIRMED');IDBObjectStore.prototype.put=native;expect(aborted).toBe(true);
    expect(await game.get_view(initial.run_id)).toEqual(before);expect(await game.get_actor_view(initial.run_id,'R')).toEqual(local);expect(await game.get_receipt(initial.run_id,envelope.operation_id)).toBeNull();
    const fresh=new Game(store),result=await fresh.control_clock(envelope);expect(Reflect.get(result.view,'artifact_reports')).toHaveLength(1);expect(await fresh.get_actor_view(initial.run_id,'R')).toMatchObject({resources:{record_energy:16,record_packs:1,durability:97,link_energy:12},artifacts:[{created_at:78000}]});
    expect((await fresh.control_clock(envelope)).receipt).toEqual(result.receipt);await expect(fresh.control_clock({...envelope,intent:{kind:'advance',to:79001}})).rejects.toThrow('OPERATION_ID_REUSED');
  }finally{IDBObjectStore.prototype.put=native;await store.delete();}
});

test('B23 partial field work restores same run paused and continues only its remaining work with unique settlement',async()=>{
  const store=new Persistence('b23-owned-t03-field-restore');
  try{
    let game=new Game(store);const initial=await game.create_run(await intelligence_definition(),'command','create'),ref=(kind:string,id:string)=>({run_id:initial.run_id,kind,id,version:1});let revision=1;
    const issue=async(id:string)=>{revision=(await game.issue_activity({run_id:initial.run_id,operation_id:id,expected_revision:revision,intent:{kind:'issue_activity',actor_ref:ref('actor','R'),activity_ref:ref('activity',id),authority_ref:ref('authority','HQ-field-authority'),basis_delivery_refs:[]}})).view.revision;};
    const tick=async(to:number)=>{const r=await game.tick(initial.run_id,to,'tick-'+to);revision=r.view.revision;return r;};
    await issue('R-to-A');await tick(32000);await issue('A-record');await tick(58000);
    revision=(await game.save({run_id:initial.run_id,operation_id:'save',expected_revision:revision,intent:{kind:'save'}})).view.revision;
    expect(await game.get_actor_view(initial.run_id,'R')).toMatchObject({resources:{record_energy:20,record_packs:2,equipment_energy_reserved:4,packs_reserved:1,durability:97},activities:[{}, {work_done_ms:20000,status:'running'}],artifacts:[]});
    game=new Game(store);const restored=await game.restore(initial.run_id,'restore');revision=restored.view.revision;expect(restored.view).toMatchObject({run_id:initial.run_id,sim_time:58000,paused:true});
    await expect(tick(78000)).rejects.toThrow('CLOCK_PAUSED');
    revision=(await game.control_clock({run_id:initial.run_id,operation_id:'continue',expected_revision:revision,intent:{kind:'continue'}})).view.revision;
    const completed=await game.tick(initial.run_id,79000,'finish-once');
    expect((await game.tick(initial.run_id,79000,'finish-once')).receipt).toEqual(completed.receipt);
    expect(await game.get_actor_view(initial.run_id,'R')).toMatchObject({resources:{record_energy:16,record_packs:1,durability:97,link_energy:12},artifacts:[{created_at:78000}]});expect(Reflect.get(completed.view,'artifact_reports')).toHaveLength(1);
  }finally{await store.delete();}
});
