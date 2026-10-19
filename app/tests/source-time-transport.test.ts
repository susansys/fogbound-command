import {test,expect,vi} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {source_time_definition} from '../src/core/source-time-definition';
import {Transport,type Response} from '../src/transport';

// This is the owned message-port fault seam, not a substitute Worker engine.
// Values come from the real Game; browser contracts run the actual Worker.
class OwnedPort{
 static current:OwnedPort;
 latest:Record<string,unknown>|null=null;
 onmessage:((event:MessageEvent<unknown>)=>void)|null=null;
 onerror:(()=>void)|null=null;
 constructor(){OwnedPort.current=this;}
 postMessage(input:Record<string,unknown>){this.latest=input;}
 emit(value:unknown){this.onmessage?.(new MessageEvent('message',{data:value}));}
 terminate(){}
}

test.each(['valid','private-field','future-time','missing-basis','invented-total'])('B31 E16 Transport admits only lawful source DTOs and never publishes a rejected raw view: %s',async(kind)=>{
 const store=new Persistence('b31-owned-transport-'+crypto.randomUUID()),game=new Game(store);let transport:Transport|undefined;
 try{
  let view=await game.create_run(source_time_definition,'research','create');view=(await game.control_clock({run_id:view.run_id,operation_id:'to115',expected_revision:view.revision,intent:{kind:'advance',to:115000}})).view;if(!('source_reading' in view))throw Error('source view missing');
  const payload=structuredClone(view);
  if(kind==='private-field')Object.assign(payload.source_reading,{private_lineage:['unlawful']});
  if(kind==='future-time')payload.source_reading.evidence[0].received=999999;
  if(kind==='missing-basis')payload.source_reading.bases=[];
  if(kind==='invented-total')Object.assign(payload.source_reading.independence,{kind:'known',count:3});
  vi.stubGlobal('Worker',OwnedPort);transport=new Transport();const observed:Response[]=[];transport.subscribe(value=>observed.push(value));
  const pending=transport.request({kind:'current',run_id:view.run_id}),port=OwnedPort.current;expect(port.latest?.kind).toBe('current');const request_id=port.latest?.request_id;
  port.emit({request_id,ok:true,view:payload});const answer=await pending;
  if(kind==='valid'){expect(answer).toEqual({request_id,ok:true,view});expect(observed).toEqual([answer]);}else{expect(answer).toEqual({request_id,ok:false,code:'CHANNEL_UNCERTAIN'});expect(observed).toEqual([answer]);expect(observed.some(value=>'view' in value)).toBe(false);}
  expect(await game.get_view(view.run_id)).toEqual(view);
 }finally{transport?.close();vi.unstubAllGlobals();await store.delete();}
});
