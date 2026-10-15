import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const identity={map_id:'PLAY-CORRIDOR-MAP',map_version:1,crs_id:'FIC-LOCAL-XY-01'};
const evidence_refs=['B21-INITIAL-GEOMETRY'];
const exact={kind:'known',value:0,unit:'fictional_metre',evidence:'B21-INITIAL-GEOMETRY'};
const scope=(id,kind,typed_geometry,uncertainty=exact)=>({id,kind,...identity,precision:0.01,uncertainty,typed_geometry,evidence_refs});
const rectangle=(x1,y1,x2,y2)=>[[x1,y1],[x2,y1],[x2,y2],[x1,y2],[x1,y1]];
const scopes=[
 scope('H','point',{position:[50,150]}),scope('A','point',{position:[150,150]}),scope('B','point',{position:[250,150]}),
 scope('approximate','point',{position:[75.25,151.5]},{kind:'known',value:5,unit:'fictional_metre',evidence:'B21-INITIAL-GEOMETRY'}),
 scope('area-with-hole','area',{outer:rectangle(270,40,330,100),holes:[rectangle(290,60,300,70)]}),
 scope('detached-area','area',{outer:rectangle(350,220,380,250),holes:[]}),
 scope('separate-regions','region_set',{area_refs:['area-with-hole','detached-area']}),
 scope('reference-edge','edge',{line:[[20,20],[40,30],[60,20]]}),
 scope('HA-area','area',{outer:rectangle(50,140,150,160),holes:[]}),
 scope('AB-area','area',{outer:rectangle(150,140,250,160),holes:[]}),
 scope('HA','corridor',{centerline:[[50,150],[150,150]],width:20,area_ref:'HA-area'}),
 scope('AB','corridor',{centerline:[[150,150],[250,150]],width:20,area_ref:'AB-area'}),
 scope('pending-location','unresolved',null,{kind:'unknown'})
];
const public_rules={version:'b21-route-1',coordinate_grid:0.01,length_scale:1000000,length_rounding:'round_half_up',duration_rounding:'ceil_total_only',load_factor_per_unit:0.02,movement_energy_per_distance:0.01,report_policy:'accepted_and_one_terminal',report_budget:2,report_energy_cost:1,report_wear_cost:1,cause_policy:'once_per_cause_rule_consumer',route_point_budget:64,conflict_candidate_budget:32};
const geometry_version=hash({identity,extent:[400,300],unit:'fictional_metre',scopes,rules:public_rules});
const map={...identity,geometry_version,extent:[400,300],unit:'fictional_metre',scopes:scopes.map(x=>({...x,geometry_version}))};
const parameters={deadline:900000,receipt_grace:10000,link_ms:1000,base_speed:4,terrain_factor:1,environment_factor:1,load_capacity:20,space_capacity:12,movement_energy:20,record_energy:20,record_wear:100,equipment_energy:16,equipment_wear:100,record_packs:2,hq_energy:16,hq_wear:100,report_budget:2,report_energy_cost:1,report_wear_cost:1};
const profile={id:'B21-CORRIDOR-01',version:1,parameters,registry:Object.entries(parameters).map(([id,value])=>({id,entry_version:1,value,unit:['deadline','receipt_grace','link_ms'].includes(id)?'ms':id==='base_speed'?'fictional_metre/s':['terrain_factor','environment_factor'].includes(id)?'ratio':id.includes('wear')?'wear':id.includes('energy')?'energy':id==='load_capacity'?'load':id==='space_capacity'?'space':'item',source_ref:id.startsWith('hq_')?'ENG-PRESTART-REPLACE/version1/catalogs.hq_terminal':'B21-GEOMETRY-DESIGN-1.0.0/movement-and-knowledge',source_type:'design_assumption',calibration_status:'uncalibrated'}))};
const capabilities=[{id:'R-MOVE-4',actor:'R',action:'move',speed:4,unit:'fictional_metre/s',evidence_refs:['B21-INITIAL-CAPABILITY']}];
const rules={...public_rules,disabled_capabilities:['record','repair','handover','withdrawal','replacement','free_surface','mission_outcome']};
const catalogs={map,actor:{id:'R',origin:'H',load_capacity:20,space_capacity:12,load:9,space:7,equipment:['EQ-REC','EQ-LINK'],qualification_refs:['R-MOVE-4']},equipment:[{id:'EQ-REC',load:4,space:3,energy:20,wear:100},{id:'EQ-LINK',load:3,space:2,energy:16,wear:100}],items:[{id:'record_pack',count:2,load:1,space:1}],hq_terminal:{id:'HQ-TERM',energy:16,wear:100,energy_per_send:1,wear_per_send:1},initial_evidence:{id:'B21-INITIAL-POSITION',scope_ref:'H',observed:{kind:'known',value:0,evidence:'B21-INITIAL-POSITION'},source_event_time:{kind:'unknown'},origin:'registered_initial_evidence'},authority:{subject:'R',action:'move',from:0,to:900000},link_authority:{subject:'R',recipient:'HQ',from:0,to:910000},engine_conditions:{closed_at_x:null,report_delivery_delay_ms:0}};
catalogs.movement_causes=[{cause_id:'terrain-plain',rule_ref:'terrain-factor',consumer:'R:move',slot:'terrain',factor:1,evidence_ref:'B21-INITIAL-TERRAIN'},{cause_id:'environment-normal',rule_ref:'environment-factor',consumer:'R:move',slot:'environment',factor:1,evidence_ref:'B21-INITIAL-ENVIRONMENT'}];
profile.registry.find(entry=>entry.id==='report_budget').unit='message';
const payload={schema:7,contract:'0.5.1',id:'B21-CORRIDOR-01',version:1,scenario_kind:'play_corridor',profile,capabilities,rules,catalogs};
const hashes={profile:hash(profile),capabilities:hash(capabilities),rules:hash(rules),catalogs:hash(catalogs),media:hash([])};
const result={...payload,hashes,definition_hash:hash({...payload,hashes})};
const target=fileURLToPath(new URL('../src/core/play-definition.json',import.meta.url));
fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({target,definition_hash:result.definition_hash,geometry_version,scopes:map.scopes.length}));
