// Author-time expansion only: runtime never reads the specification or merges profiles.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const text = fs.readFileSync('../docs/requirements/product-v0.5.1-parameters.md', 'utf8');
const registry = text.split('## 2 ')[0].split('\n').filter(line => /^\| S\d\d /.test(line)).map(line => {
  const cells = line.split('|').slice(1, -1).map(x => x.trim());
  return { id: cells[0], entry_version: 2, owner_system: cells[0].slice(0,3), type_unit: cells[1], value: cells[2], rule: cells[3], source_ref: `FIC-BASE-01/version2/${cells[0]}`, source_type: 'design_assumption', calibration_status: 'uncalibrated' };
});
const overrides = {
  'S04 map.extent': '[0,400]×[0,300]fictional_metre',
  'S06 team.slots': '1虚构link_keeper角色R',
  'S04 movement.path_mode': 'corridor',
  'S03 objective.deadline': '600000ms; receipt_grace_ms=10000',
};
for (const row of registry) if (overrides[row.id]) { row.value = overrides[row.id]; row.entry_version = 3; row.source_ref = `FB01-ENG-MOVE/version1/${row.id}`; }
const parameters = { extent: [400,300], origin: [50,150], target: [170,150], corridor_width: 20, speed: 4, load: 3, load_factor: [106,100], move_ms: 31800, link_ms: 1000, fix_ms: 5000, task_expiry_ms: 120000, authority_from: 0, authority_to: 600000, deadline: 600000, grace: 10000, equipment_energy: 16, equipment_wear: 100, movement_energy: 20, message_energy: 1, message_wear: 1, move_energy_per_100: 1, snapshot_interval: 30000, warning_ms: 120000 };
const extras = Object.entries(parameters).map(([key,value]) => ({ id:`FB01 ${key}`, entry_version: 1, owner_system:'FB01', type_unit: Array.isArray(value) ? 'fixed tuple' : 'finite numeric game quantity', value, rule: 'fixed engineering profile; no runtime override', source_ref:`FB01-ENG-MOVE/version1/${key}`, source_type:'design_assumption', calibration_status:'uncalibrated' }));
const payload = { schema:4, contract:'0.5.1', id:'FB01-ENG-MOVE', version:1, profile:{id:'FB01-ENG-MOVE',version:1,parent_ref:'FIC-BASE-01/version2',registry:[...registry,...extras],parameters}, capabilities:['corridor_move','report_delivery','management_pause','resume_latest','known_replay','single_writer'], rules:{version:'fb01-rules-1',message_policy:'queue_until_expiry',movement:'rational_elapsed_then_round_display',rng_algorithm:'xorshift32-v1',rng_seed:1,rng_used:false}, catalogs:{actor:{id:'R',role:'link_keeper',movement_capacity:1,equipment:'EQ-LINK'},equipment:{id:'EQ-LINK',load:3,space:2,energy:16,wear:100},geometry:{H:[50,150],T:[170,150],corridor:{from:'H',to:'T',width:20},plain:[0,0,200,300],rough:[200,0,400,300]},authority:{subject:'HQ',recipient:'R',action:'corridor_move',target:'T',from:0,to:600000},report:{id:'REPORT-T',origin:'虚构工位登记册',target:'T',source_event_time:{kind:'unknown'},observed:{value:0,evidence:'initial-observation'},reported:{value:0,evidence:'initial-report'}},delivery:{id:'DELIVERY-T',report_id:'REPORT-T',received:{value:0,evidence:'initial-delivery'}},position:{x:50,y:150,observed:0,received:0,evidence:'initial-position'}} };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hashes={profile:hash(payload.profile),capabilities:hash(payload.capabilities),rules:hash(payload.rules),catalogs:hash(payload.catalogs),media:hash([])};
fs.mkdirSync('src/core',{recursive:true});
fs.writeFileSync('src/core/engineering.json',JSON.stringify({...payload,hashes,definition_hash:hash({...payload,hashes})},null,2)+'\n');
console.log(`${registry.length} base rows + ${extras.length} engineering entries resolved`);
