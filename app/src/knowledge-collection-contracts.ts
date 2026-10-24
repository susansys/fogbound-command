import type {Mode} from './contracts';
export type CollectionActor='R'|'W';
export type CollectionRef<K extends string=string>={run_id:string;kind:K;id:string;version:1};
export type CollectionTime={kind:'known';value:number;evidence:CollectionRef}|{kind:'unknown'};
export type CollectionRectangle={min_x:number;max_x:number;min_y:number;max_y:number};
export type CollectionRequestIntent={
  kind:'request_collection';actor:CollectionActor;question_ref:CollectionRef<'question'>;target_ref:CollectionRef<'facility'>;
  scope_ref:CollectionRef<'scope'>;method_ref:CollectionRef<'method'>;authority_ref:CollectionRef<'authority'>;
  basis_refs:CollectionRef<'briefing'>[];collection_window:{from:number;to:number};needed_by:number;
};
export type CollectionCancelIntent={kind:'cancel_collection';request_ref:CollectionRef<'collection_request'>;authority_ref:CollectionRef<'authority'>};
export type KnowledgeCollectionIntent=CollectionRequestIntent|CollectionCancelIntent|{kind:'advance';to:number};
export type KnowledgeCollectionEnvelope={run_id:string;operation_id:string;expected_revision:number;intent:KnowledgeCollectionIntent};
export type CollectionReport={
  ref:CollectionRef<'report'>;source_actor:CollectionActor;method:'limited-text-collection'|'qualified-facility-inspection'|'task-control-receipt';
  target_ref:CollectionRef<'facility'>;scope_ref:CollectionRef<'scope'>;method_ref:CollectionRef<'method'>;
  requested_method_ref:CollectionRef<'method'>;
  observation_ref:CollectionRef<'observation'>|null;record_ref:CollectionRef<'record'>|null;observed_time:CollectionTime;generated_at:number;source_reported_time:{kind:'unknown'};
  body:{kind:'limited_indication';field:'B.condition';quality:'limited';outcome:'inconclusive';limits:string[]}|{kind:'qualified_facility_field';field:'B.condition';condition:'operable';object_version:1;quality:'qualified';outcome:'detected';qualification_ref:CollectionRef<'qualification'>;limits:string[]}|{kind:'collection_failed';field:'B.condition';quality:'failed';outcome:'not_covered';conclusion:'unknown';reason:'window_closed'|'empty_scope';attempted_interval:{from:number;to:number};collection_work_ms:number;limits:string[]}|{kind:'collection_cancelled';field:'B.condition';quality:'failed';outcome:'not_covered';conclusion:'unknown';reason:'cancelled_before_start';collection_work_ms:0;limits:string[]};
  control_outcomes:Array<{request_ref:CollectionRef<'cancellation'>;result:'cancelled'|'already_started'|'already_completed';decided_at:number}>;
  resource_snapshot:{actor:CollectionActor;at:number;energy_used_j:number};
  coverage:{planned_scope:CollectionRectangle;actual_scope:CollectionRectangle[];planned_area_m2:number;actual_area_m2:number|null;geometry_version:string;model_version:1};
  content_digest:string;
};
export type CollectionDelivery={ref:CollectionRef<'delivery'>;report_ref:CollectionRef<'report'>;message_ref:CollectionRef<'message'>;sender:CollectionActor;recipient:'HQ';sent_at:number;received_at:number;knowledge_seq:number};
export type CollectionCoverage={ref:CollectionRef<'coverage'>;report_ref:CollectionRef<'report'>;delivery_ref:CollectionRef<'delivery'>;quality:CollectionReport['body']['quality'];outcome:CollectionReport['body']['outcome'];observed_time:CollectionTime;method_ref:CollectionRef<'method'>;limits:string[]}&CollectionReport['coverage'];
export type KnowledgeCollectionPlayerView={
  scenario_kind:'play_knowledge_collection';run_id:string;revision:number;sim_time:number;
  mode:Mode;rate:1|2|4;paused:boolean;finished:boolean;source_run:string|null;status:'ready';
  can_issue:boolean;next_action:string;gap:string;
  actors:Array<{id:'R'|'W';position:{point:[number,number];observed_at:number;received_at:number;evidence:string}}>;
  public_rules:{deadline:number;receipt_grace:number;cleanup_duration:number};
  geometry:{unit:string;metres_per_coordinate:number;points:{H:number[];A:number[];B:number[]}};
  replay_nodes:Array<{revision:number;at:number;meaningful:boolean;label:string}>;
  collection_requests:Array<{ref:CollectionRef<'collection_request'>;actor:CollectionActor;issued_at:number;status:'tasking'|'collecting'|'processing'|'inconclusive'|'answered'|'expired'|'cancelled';local_receipt:null|{kind:'cancelled_before_send';at:number;remote_task_created:false};acknowledgement:null|{stage:'waiting_window'|'collecting';sent_at:number;received_at:number;planned_start_at:number}}>;
  reports:CollectionReport[];deliveries:CollectionDelivery[];coverage:CollectionCoverage[];facility_knowledge:null;
};
