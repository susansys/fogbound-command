import {GameError,type Mode} from '../contracts';
import type {CollectionActor,CollectionRef,CollectionRectangle,CollectionRequestIntent,CollectionReport,CollectionDelivery,KnowledgeCollectionEnvelope} from '../knowledge-collection-contracts';
import type {KnowledgeCollectionDefinition} from './knowledge-collection-definition';
export type IntelWorkJob={id:string;kind:'preparation'|'processing'|'verification';resource_ref:'INTEL';ticket:number;eligible_at:number;work_ms:number;used_ms:number;status:'queued'|'processing'|'completed'|'cancelled'|'failed';started_at:number|null;completed_at:number|null};
export type IntelWorkPool={resource_ref:'INTEL';capacity:1;at:number;next_ticket:number;jobs:IntelWorkJob[]};
export type CollectionRequirementState={ref:CollectionRef<'requirement'>;request_id:string;question_ref:CollectionRef<'question'>;needed_by:number;status:'open'|'tasking'|'collecting'|'processing'|'answered'|'inconclusive'|'expired'|'cancelled'};
export type CollectionTaskState={ref:CollectionRef<'collection_task'>;request_id:string;requirement_ref:CollectionRef<'requirement'>;source_actor:CollectionActor;labor_ref:string;device_ref:string;window:{from:number;to:number};scope_ref:CollectionRef<'scope'>;method_ref:CollectionRef<'method'>;authority_ref:CollectionRef<'authority'>;basis_refs:CollectionRef<'briefing'>[];status:'planned'|'allocated'|'collecting'|'collected'|'failed'|'cancelled';started_at:number|null;observed_at:number|null};
export type KnowledgeCollectionState={
  schema:14;contract:'0.5.1';scenario_kind:'play_knowledge_collection';run_id:string;revision:number;sim_time:number;
  mode:Mode;rate:1|2|4;paused:boolean;finished:boolean;ended:boolean;status:'ready';source_run:string|null;
  definition_hash:string;hashes:Record<string,string>;definition:KnowledgeCollectionDefinition;
  initial_conditions:{surface:'default'|'empty'};
  rng:{algorithm:'xorshift32-v1';version:1;seed:1;state:1;origin:string;used:false};
  generation:number;phase:'committed';integrity?:string;
  actors:Record<CollectionActor,{position:[number,number];energy_used_uj:number;sender_free_at:number;blank_record:boolean}>;
  hq_sender_free_at:number;knowledge_seq:number;
  intel:IntelWorkPool;
  commands:Array<{ref:CollectionRef<'message'>;request_id:string;kind:'receive_collection'|'cancel_received';recipient:CollectionActor;planned_sent_at:number;planned_received_at:number;sent_at:number|null;delivered_at:number|null;cancelled_at:number|null;status:'queued'|'sending'|'delivered'|'cancelled'}>;
  requests:CollectionRequestState[];
  requirements:CollectionRequirementState[];collection_tasks:CollectionTaskState[];
  observations:Array<{ref:CollectionRef<'observation'>;request_id:string;observed_at:number;actual_scope:CollectionRectangle[];sample:{kind:'limited_indication'}|{kind:'facility_condition';condition:'operable';object_version:1}}>;
  facility:{condition:'operable';version:1};
  reports:CollectionReport[];deliveries:CollectionDelivery[];
  records:Array<{ref:CollectionRef<'record'>;holder:CollectionActor;mass_kg:number;report_ref:CollectionRef<'report'>;canonical_content:string;content_digest:string}>;
  schedule:Array<{at:number;sequence:number;kind:'hq_send'|'receive_collection'|'start_collection'|'collection_complete'|'registration_complete'|'accepted_receipt'|'report_delivery'|'cancel_received'|'ir_expiry';request_id:string;command_id?:string}>;
  event_sequence:number;
  inputs:Array<{envelope:KnowledgeCollectionEnvelope;at:number;revision:number;clock_to?:number}>;
};
export type CollectionRequestState={ref:CollectionRef<'collection_request'>;intent:CollectionRequestIntent;issued_at:number;received_at:number|null;planned_start_at:number;started_at:number|null;collection_end:number|null;collection_stopped_at:number|null;stop_reason:'window_closed'|'empty_scope'|null;registered_at:number|null;accepted_sent_at:number|null;accepted_stage:'waiting_window'|'collecting'|null;accepted_received_at:number|null;report_sent_at:number|null;report_received_at:number|null;status:'tasking'|'waiting'|'collecting'|'registering'|'completed'|'failed'|'cancelled';cancel:null|{ref:CollectionRef<'cancellation'>;origin:'local_queue'|'remote';issued_at:number;received_at:number|null;result:'cancelled'|'already_started'|'already_completed'|null}};
export function initial_knowledge_collection_state(definition:KnowledgeCollectionDefinition,run_id:string,mode:Mode,generation:number,source_run:string|null=null,origin=run_id,surface:'default'|'empty'='default'):KnowledgeCollectionState{
  if(!Object.hasOwn(definition.diagnostic_sampling_surfaces,surface))throw new GameError('INVALID_DEFINITION');
  return {schema:14,contract:'0.5.1',scenario_kind:'play_knowledge_collection',run_id,revision:1,sim_time:0,mode,rate:1,paused:source_run!==null||mode==='research',finished:false,ended:false,status:'ready',source_run,
    definition_hash:definition.definition_hash,hashes:structuredClone(definition.hashes),definition:structuredClone(definition),initial_conditions:{surface},
    rng:{algorithm:'xorshift32-v1',version:1,seed:1,state:1,origin,used:false},generation,phase:'committed',inputs:[],
    actors:{R:{position:[250,150],energy_used_uj:0,sender_free_at:0,blank_record:true},W:{position:[250,150],energy_used_uj:0,sender_free_at:0,blank_record:true}},facility:structuredClone(definition.facility),hq_sender_free_at:0,knowledge_seq:0,intel:{resource_ref:'INTEL',capacity:1,at:0,next_ticket:1,jobs:[]},commands:[],requests:[],requirements:[],collection_tasks:[],observations:[],reports:[],deliveries:[],records:[],schedule:[],event_sequence:0};
}
