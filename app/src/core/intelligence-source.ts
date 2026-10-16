import type {IntelligenceState} from './intelligence-state';
import type {IntelligenceDefinition} from './intelligence-definition';
// Source collection is a complete registered activity. Fixed communication has
// no equipment balance; collection still reserves and settles its own recipe.
export function advance_intelligence_source(state:IntelligenceState,to:number,definition:IntelligenceDefinition){
  const p=definition.profile.parameters,source=state.source,actor=definition.catalogs.source;
  if(to<p.source_start||source.settled||source.work.status==='blocked')return;
  if(source.work.status==='pending'){
    if(actor.role!=='record_keeper'||actor.equipment!=='REC'||source.resources.energy<p.source_energy_cost||source.resources.packs<p.source_pack_cost||source.resources.durability<p.source_first_wear){source.work.status='blocked';return;}
    source.resources.energy_reserved=p.source_energy_cost;source.resources.packs_reserved=p.source_pack_cost;source.work.status='running';
  }
  const duration=p.source_work*p.ms_per_work,until=Math.min(to,p.deadline),done=Math.min(duration,Math.max(0,until-p.source_start));
  source.work.done_ms=done;
  if(done>0&&!source.wear_charged){source.resources.durability-=p.source_first_wear;source.wear_charged=true;}
  if(done<duration&&to<p.deadline)return;
  source.resources.energy-=Math.ceil(p.source_energy_cost*done/duration);source.resources.packs-=Math.ceil(p.source_pack_cost*done/duration);
  source.resources.energy_reserved=0;source.resources.packs_reserved=0;source.settled=true;
  source.work.status=done===duration?'completed':'cutoff';
  if(source.work.status!=='completed')return;
  const completed=p.source_start+duration;
  source.published_report_ref='R3';
  const actual=definition.catalogs.engine_conditions.actual_access==='blue'?'blue':'green';
  state.reports.push({run_id:state.run_id,id:'R3',version:1,kind:'raw_record',origin:{kind:'known',actor:actor.actor},source_descriptor:'ArchiveSource署名的现场采集记录；署名不证明来源独立',subject:'B访问凭证',text:'原文称：B处访问凭证为'+(actual==='blue'?'蓝色':'绿色')+'。',source_event_time:{kind:'unknown'},observed:{kind:'known',value:completed,evidence:'R3-source-work'},source_published:completed,quality:'unknown',reliability:'unassessed',claimed_confirmation:'unverified',typed_payload:{kind:'access',value:actual},provenance:{kind:'original'},attachment_refs:[]});
}
