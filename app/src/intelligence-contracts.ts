import type {Mode,PlayerView,KnownTime} from './contracts';
import type {PublicMap} from './spatial';
import type {PositionKnowledge} from './play-contracts';
export type IntelligenceRef<K extends string>={run_id:string;kind:K;id:string;version:number};
export type IntelligenceReport={run_id:string;id:string;version:1;kind:'raw_record';origin:{kind:'unknown'}|{kind:'known';actor:string};source_descriptor:string;subject:string;text:string;source_event_time:KnownTime;observed:KnownTime;source_published:number;quality:'unknown';reliability:'unassessed';claimed_confirmation:'unverified';typed_payload:{kind:'access';value:'blue'|'green'};provenance:{kind:'original'};attachment_refs:[]};
export type IntelligenceDelivery={run_id:string;id:string;kind:'report_delivery';version:1;report_ref:IntelligenceRef<'report'>;sender:string;target:'HQ';sent:number;received:number;forward_of:null|{kind:'confirmed';report_ref:IntelligenceRef<'report'>;supporting_evidence_ref:IntelligenceRef<'lineage_evidence'>;received:number}};
export type IntelligenceSourceGroup={report_ref:IntelligenceRef<'report'>;delivery_refs:string[];relation:'confirmed_common_original'|'unknown';origin_attribution:{kind:'unknown'};independent_evidence_count:{kind:'unknown'};lineage_links:Array<{kind:'forward_of';certainty:'confirmed';supporting_evidence_ref:IntelligenceRef<'lineage_evidence'>;received:number}>};
export type IntelligenceActorConfirmation={actor:'R'|'W';role:'record_keeper'|'work_keeper';people:number;position_scope:string;load:number;space:number;load_capacity:number;space_capacity:number;movement_energy:number;equipment_energy:number;durability:number;packs:number;link:{energy:number;durability:number}|null;confirmed_at:number};
export type IntelligencePlayerView={
  scenario_kind:'play_intelligence';run_id:string;revision:number;sim_time:number;mode:Mode;rate:1|2|4;paused:boolean;finished:false;source_run:string|null;
  access:{blue:'unverified';green:'unverified'};received_reports:Array<{report:IntelligenceReport;delivery:IntelligenceDelivery}>;source_groups:IntelligenceSourceGroup[];
  geometry:PublicMap;can_issue:false;next_action:string;gap:string;replay_nodes:PlayerView['replay_nodes'];log:PlayerView['log'];
  position_knowledge:PositionKnowledge;
  actors:IntelligenceActorConfirmation[];
  processing:{capacity:number;initial_occupied_until:number;energy_confirmed:number;confirmed_at:number};
};
