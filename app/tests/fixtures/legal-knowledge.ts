import type {PlayerView} from '../../src/contracts';
// Independently authored public counterpart of knowledge-states.ts. No private fields.
export const legalKnowledge:PlayerView={
  run_id:'fixture-run',revision:4,sim_time:6000,mode:'research',rate:1,paused:true,finished:false,status:'executing',source_run:null,
  position:{x:50,y:150,observed:0,received:0,evidence:'initial-fix'},
  report:{id:'report-t',origin:'虚构登记册',target:'T',source_event_time:{kind:'unknown'},observed:{value:0,evidence:'initial-observation'},reported:{value:0,evidence:'initial-report'}},
  delivery:{id:'delivery-t',report_id:'report-t',received:{value:0,evidence:'initial-delivery'}},
  resources:{equipment_energy:15,equipment_wear:99,movement_energy:20,confirmed_at:2000},
  geometry:{H:[50,150],T:[170,150],extent:[400,300],corridor_width:20,plain:[0,0,200,300],rough:[200,0,200,300]},authority:{from:0,to:600000},
  issued_orders:[],replay_nodes:[{revision:1,at:0,meaningful:true,label:'开局登记后 · 记录 1'}],can_issue:false,next_action:'等待编组位置及抵达回报',gap:'编组已接令并开始行动，尚未收到抵达回报',
  log:[{id:'ack',at:2000,kind:'accepted_receipt',text:'收到接令回报',observed:1000,evidence:'ack-delivery'}],
};
