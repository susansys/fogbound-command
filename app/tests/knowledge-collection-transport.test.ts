import {expect,test,vi} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {Transport} from '../src/transport';
import {valid_request} from '../src/protocol';
import {valid_response} from '../src/dto';

class OwnedPort{
  static current:OwnedPort;
  latest:Record<string,unknown>|null=null;
  onmessage:((event:MessageEvent<unknown>)=>void)|null=null;
  onerror:(()=>void)|null=null;
  constructor(){OwnedPort.current=this;}
  postMessage(value:Record<string,unknown>){this.latest=value;}
  emit(value:unknown){this.onmessage?.(new MessageEvent('message',{data:value}));}
  terminate(){}
}

test('KA-E09 an actual IndexedDB abort commits neither a collection task nor its receipt and blocks further candidates',async()=>{
  const store=new Persistence('ka-owned-atomic-collection-'+crypto.randomUUID()),game=new Game(store);
  try{
    const view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research','create');
    const ref=(kind:string,id:string)=>({run_id:view.run_id,kind,id,version:1});
    const envelope={run_id:view.run_id,operation_id:'failed',expected_revision:view.revision,intent:{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000}};
    const before=await store.read_committed(view.run_id),native=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){const result=native.apply(this,args);if(this.name==='runs')result.addEventListener('success',()=>this.transaction.abort(),{once:true});return result;};
    try{await expect(game.apply_collection_intent(envelope)).rejects.toThrow('STORAGE_UNCONFIRMED');}
    finally{IDBObjectStore.prototype.put=native;}
    expect(await store.read_committed(view.run_id)).toEqual(before);
    expect(await game.get_view(view.run_id)).toEqual(view);
    expect(await game.get_receipt(view.run_id,'failed')).toBeNull();
    await expect(game.apply_collection_intent({...envelope,operation_id:'another-candidate'})).rejects.toThrow('STORAGE_UNCONFIRMED');
    expect(await store.read_committed(view.run_id)).toEqual(before);
  }finally{await store.delete();}
});

test('KA-E09 transports only lawful collection Game views and rejects private data and unsupported media',async()=>{
  const store=new Persistence('ka-owned-transport-'+crypto.randomUUID()),game=new Game(store);let transport:Transport|undefined;
  try{
    const view=await game.create_run({schema:14,contract:'0.5.1',package_ref:{id:'KA-TEXT-KNOWLEDGE-01',version:1}},'research','create');
    if(view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong collection branch');
    const ref=(kind:string,id:string)=>({run_id:view.run_id,kind,id,version:1});
    const envelope={run_id:view.run_id,operation_id:'collect',expected_revision:view.revision,intent:{kind:'request_collection',actor:'R',question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope','B-LIMITED'),method_ref:ref('method','limited-text-collection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-R')],collection_window:{from:1000,to:31000},needed_by:900000}};
    expect(valid_request({request_id:'ka-collect',kind:'operate_knowledge_collection',envelope})).toBe(true);
    expect(valid_request({request_id:'ka-collect-media',kind:'operate_knowledge_collection',envelope:{...envelope,intent:{...envelope.intent,attachment:{kind:'image',storage_ref:'private'}}}})).toBe(false);
    vi.stubGlobal('Worker',OwnedPort);transport=new Transport();
    for(const payload of [view,{...view,world:{facility:'operable'}},{...view,media:[{storage_ref:'private'}]},{...view,actors:[{...view.actors[0],private_position:[0,0]},view.actors[1]]}]){
      const pending=transport.request({kind:'current',run_id:view.run_id}),port=OwnedPort.current,request_id=port.latest?.request_id;
      port.emit({request_id,ok:true,view:payload});
      expect(await pending).toEqual(payload===view?{request_id,ok:true,view}:{request_id,ok:false,code:'CHANNEL_UNCERTAIN'});
    }
    const issued=await game.apply_collection_intent(envelope);
    expect(await game.get_receipt(view.run_id,'collect')).toEqual(issued.receipt);
    expect(await game.get_receipt(view.run_id,'not-submitted')).toBeNull();
    const delivered=await game.control_clock({run_id:view.run_id,operation_id:'to-delivery',expected_revision:issued.view.revision,intent:{kind:'advance',to:32000}});
    const before=await store.read_committed(view.run_id);
    expect((await game.apply_collection_intent(envelope)).receipt).toEqual(issued.receipt);
    expect(await store.read_committed(view.run_id)).toEqual(before);
    await expect(game.apply_collection_intent({...envelope,intent:{...envelope.intent,needed_by:800000}})).rejects.toThrow('OPERATION_CONFLICT');
    expect(await store.read_committed(view.run_id)).toEqual(before);
    expect(valid_response({request_id:'ka-delivered',ok:true,view:delivered.view})).toBe(true);
    if(delivered.view.scenario_kind!=='play_knowledge_collection')throw Error('Wrong collection branch');
    const changed=structuredClone(delivered.view);changed.reports[0].record_ref!.run_id='another-run';
    expect(valid_response({request_id:'ka-corrupt',ok:true,view:changed})).toBe(false);
  }finally{transport?.close();vi.unstubAllGlobals();await store.delete();}
});
