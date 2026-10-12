import type {State} from '../../src/core/state';
// Authored Knowledge-interface inputs, never loaded into Game or written to storage.
// Their private alternatives deliberately disagree while the delivered evidence is identical.
const delivered={
  run_id:'fixture-run',revision:4,sim_time:6000,mode:'research' as const,rate:1 as const,paused:true,finished:false,ended:false,status:'executing' as const,source_run:null,
  schema:4 as const,contract:'0.5.1' as const,definition_hash:'knowledge-fixture-only',hashes:{},rng:{algorithm:'xorshift32-v1' as const,version:1 as const,seed:1 as const,state:1 as const,origin:'fixture-run',used:false as const},generation:1,phase:'committed' as const,
  known:{position:{x:50,y:150,observed:0,received:0,evidence:'initial-fix'},report:{id:'report-t',origin:'虚构登记册',target:'T',source_event_time:{kind:'unknown' as const},observed:{value:0,evidence:'initial-observation'},reported:{value:0,evidence:'initial-report'}},delivery:{id:'delivery-t',report_id:'report-t',received:{value:0,evidence:'initial-delivery'}},resources:{equipment_energy:15,equipment_wear:99,movement_energy:20,confirmed_at:2000}},
  public_rules:{geometry:{H:[50,150] as [number,number],T:[170,150] as [number,number],extent:[400,300] as [number,number],corridor_width:20,plain:[0,0,200,300] as [number,number,number,number],rough:[200,0,200,300] as [number,number,number,number]},authority:{from:0,to:600000},preview:{distance:120 as const,estimated_move_ms:31800 as const,link_ms:1000 as const}},
  movement_rules:{fix_ms:5000,task_expiry_ms:120000},inputs:[],order:null,
  log:[{id:'ack',at:2000,kind:'accepted_receipt',text:'收到接令回报',observed:1000,evidence:'ack-delivery'}],
};
export const alternatives:State[]=[
  {...delivered,world:{position:{xn:2190000,yn:4770000,d:31800},equipment_energy:14,equipment_wear:98,movement_energy:20,sends:2,completed:false,stopped:false},schedule:[{id:'ENGINE_ONLY_ALFA',at:7000,phase:20,generation:1,kind:'fix_receipt'}]},
  {...delivered,world:{position:{xn:170,yn:150,d:1},equipment_energy:8,equipment_wear:92,movement_energy:18,sends:8,completed:true,stopped:false},schedule:[{id:'ENGINE_ONLY_BRAVO',at:9000,phase:20,generation:1,kind:'complete_receipt'}]},
];
