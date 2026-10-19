import {test,expect,vi} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {conflicting_action_definition} from '../src/core/conflicting-action-definition';
import {Transport,type Response} from '../src/transport';
import {valid_request} from '../src/protocol';
import {valid_response} from '../src/dto';

// Only the message port is controlled. Every payload originates from the real
// public Game; actual Worker and UI journeys remain separate browser evidence.
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

test.each(['valid','private-field','future-basis','invented-total','event-zero','cross-run-basis'])('B32 E04/E06 Transport admits lawful judgments and rejects private or inconsistent raw views: %s',async(kind)=>{
 const store=new Persistence('b32-owned-message-port-'+crypto.randomUUID()),game=new Game(store);let transport:Transport|undefined;
 try{
  let view=await game.create_run(conflicting_action_definition,'research','create');
  view=(await game.control_clock({run_id:view.run_id,operation_id:'to-claims',expected_revision:view.revision,intent:{kind:'advance',to:22000}})).view;
  const request={run_id:view.run_id,operation_id:'judgment',expected_revision:view.revision,intent:{kind:'save_working_assessment',base_ref:null,draft:{target_scope:'B',explanations:['operable','faulted'],basis_refs:[{run_id:view.run_id,kind:'facility_report',id:'FC2',version:1}]}}};
  view=(await game.apply_outcome_intent(request)).view;
  const payload=structuredClone(view),action=Reflect.get(payload,'conflicting_action');
  if(kind==='private-field')Object.assign(action,{facility:{current:'faulted'}});
  if(kind==='future-basis')action.assessments[0].recorded_at=20000;
  if(kind==='invented-total')action.independence={kind:'known',count:2};
  if(kind==='event-zero')action.reports[0].event_time={kind:'known',value:0,basis_ref:action.reports[0].observed_time.basis_ref};
  if(kind==='cross-run-basis')action.assessments[0].basis_refs[0].run_id='another-run';
  vi.stubGlobal('Worker',OwnedPort);transport=new Transport();const observed:Response[]=[];transport.subscribe(value=>observed.push(value));
  const pending=transport.request({kind:'current',run_id:view.run_id}),port=OwnedPort.current,request_id=port.latest?.request_id;
  port.emit({request_id,ok:true,view:payload});const answer=await pending;
  if(kind==='valid'){
   expect(answer).toEqual({request_id,ok:true,view});expect(observed).toEqual([answer]);
   expect(valid_request({request_id:'b32-create',kind:'create',definition_ref:'B32-CONFLICTING-ACTION-01',mode:'research',operation_id:'b32-create'})).toBe(true);
   expect(valid_request({request_id:'b32-save',kind:'operate_conflicting_action',envelope:request})).toBe(true);
   const runs=await store.list_runs();expect(runs).toMatchObject([{scenario_kind:'play_outcome',conflicting_package:{id:'B32-CONFLICTING-ACTION-01',version:1}}]);
   expect(valid_response({request_id:'b32-list',ok:true,runs})).toBe(true);
  }else{expect(answer).toEqual({request_id,ok:false,code:'CHANNEL_UNCERTAIN'});expect(observed).toEqual([answer]);expect(observed.some(value=>'view' in value)).toBe(false);}
  expect(await game.get_view(view.run_id)).toEqual(view);
 }finally{transport?.close();vi.unstubAllGlobals();await store.delete();}
});
