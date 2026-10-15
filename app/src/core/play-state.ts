import type {Mode} from '../contracts';
import {GameError} from '../contracts';
import type {PositionKnowledge,PlayStatus,PlayResources,PlayReport,PlayDelivery} from '../play-contracts';
import type {State} from './state';
import type {PlayDefinition} from './scenario';
import {validate_public_map} from '../spatial';
import type {RoutePlan} from '../route-contracts';
import {rational_position,type RationalPosition,type Fraction,type PathTiming} from './play-timing';

export type PlayTask={command_id:string;issued:number;plan:RoutePlan;reason?:string;generation:number;status:'registered'|'sent'|'accepted'|'refused';sent_at:number|null;accepted_at:number|null};
type EventBase={id:string;at:number;phase:number};
export type PlayTaskEvent=EventBase&(
  |{kind:'send_command'|'receive_command';command_id:string;generation:number}
  |{kind:'complete';activity_id:string;generation:number}
  |{kind:'send_report';draft_id:string}
  |{kind:'receive_report';report_id:string}
  |{kind:'deadline'}
  |{kind:'discovery';activity_id:string;generation:number;elapsed:Fraction}
);
export type PlayActivity=PathTiming&{id:string;command_id:string;path:RoutePlan['path'];generation:number;status:'moving'|'arrived'|'blocked'|'cutoff';starts:number;completes:number;reserved:number;settled:boolean;terminal_at:number|null;segment_index:number;distance_travelled:Fraction;settlement:{distance:Fraction;energy:number;released:number;at:number}|null};
export type LocalReportDraft={id:string;kind:PlayReport['kind'];command_id:string;activity_id:string|null;observed:PlayReport['observed'];position_scope:PlayReport['position_scope'];status:'pending'|'sent'|'unsent';report_id:string|null;refusal_reason:PlayReport['refusal_reason']};
export type PlayTransmission={id:string;at:number;sender:'HQ'|'R';message_ref:string;energy_before:number;energy_after:number;wear_before:number;wear_after:number;energy:number;wear:number};

export type PlayState={
  schema:7;scenario_kind:'play_corridor';contract:'0.5.1';integrity?:string;definition_hash:string;hashes:Record<string,string>;
  run_id:string;revision:number;sim_time:number;mode:Mode;rate:1|2|4;paused:boolean;finished:false;ended:boolean;status:PlayStatus;
  source_run:string|null;rng:State['rng'];generation:number;origin_generation:number;phase:'committed';inputs:State['inputs'];
  world:{position:RationalPosition;resources:PlayResources};
  known:{position_knowledge:PositionKnowledge;resources:PlayResources};
  log:State['log'];
  requests:PlayTask[];queue:PlayTaskEvent[];
  activities:PlayActivity[];local_reports:LocalReportDraft[];reports:PlayReport[];deliveries:PlayDelivery[];transmissions:PlayTransmission[];
};
export function initial_play_state(definition:PlayDefinition,run_id:string,mode:Mode,generation:number,source_run:string|null=null,rng_origin=run_id):PlayState{
  const map=structuredClone(definition.catalogs.map);validate_public_map(map);
  const initial=definition.catalogs.initial_evidence,scope=map.scopes.find(x=>x.id===initial.scope_ref),origin=map.scopes.find(x=>x.id===definition.catalogs.actor.origin);
  if(!scope||origin?.kind!=='point')throw new GameError('INVALID_DEFINITION');
  const p=definition.profile.parameters;
  const resources={equipment_energy:p.equipment_energy,equipment_wear:p.equipment_wear,movement_energy:p.movement_energy,movement_energy_reserved:0,record_energy:p.record_energy,record_wear:p.record_wear,record_packs:p.record_packs,hq_energy:p.hq_energy,hq_wear:p.hq_wear,confirmed_at:0};
  const evidence={observed:structuredClone(initial.observed),reported:{kind:'unknown' as const},source_event_time:structuredClone(initial.source_event_time),received:null,provenance:{kind:'registered_initial' as const,initial_evidence_ref:initial.id},evidence_refs:[initial.id]};
  const position_knowledge:PositionKnowledge=scope.kind==='unresolved'?{status:'unresolved',...evidence}:{status:'known_scope',scope,...evidence};
  return {schema:7,scenario_kind:'play_corridor',contract:'0.5.1',definition_hash:definition.definition_hash,hashes:structuredClone(definition.hashes),run_id,revision:1,sim_time:0,mode,rate:1,paused:mode==='research',finished:false,ended:false,status:'ready',source_run,rng:{algorithm:'xorshift32-v1',version:1,seed:1,state:1,origin:rng_origin,used:false},generation,origin_generation:generation,phase:'committed',inputs:[],requests:[],queue:[],activities:[],local_reports:[],reports:[],deliveries:[],transmissions:[],world:{position:rational_position(origin.typed_geometry.position),resources:structuredClone(resources)},known:{position_knowledge,resources},log:[{id:'initial-evidence',at:0,kind:'initial_evidence',text:'初始位置依据已登记；地图范围来自公开几何目录。',evidence:initial.id}]};
}
