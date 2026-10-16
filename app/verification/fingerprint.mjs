import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from '@playwright/test';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const origin=process.env.FB01_URL??'http://127.0.0.1:4175';
let html;
for(let attempt=0;attempt<100;attempt++){
  try{const response=await fetch(origin,{signal:AbortSignal.timeout(1000)});if(response.ok){html=await response.text();if(html.includes('玄枢行动'))break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
}
if(!html?.includes('玄枢行动'))throw Error('static service unavailable');
const entry=html.match(/src="([^"]+\.js)"/)?.[1];
if(!entry)throw Error('missing public entry');
async function asset(path){const response=await fetch(new URL(path,origin));if(!response.ok)throw Error('missing public asset');const bytes=Buffer.from(await response.arrayBuffer());return {path,sha256:sha(bytes),bytes};}
const main=await asset(entry),workerPath=main.bytes.toString().match(/\/assets\/worker-[A-Za-z0-9_-]+\.js/)?.[0];
if(!workerPath)throw Error('missing worker entry');
const worker=await asset(workerPath),styles=[];
const manifestBytes=await fs.readFile('src/regional-assets/manifest.json'),manifest=JSON.parse(manifestBytes),release=JSON.parse(await fs.readFile('src/regional-assets/trusted-release.json'));
if(sha(manifestBytes)!==release.manifest_sha256||sha(await fs.readFile('verification/generate-regional.mjs'))!==manifest.generator_source_sha256)throw Error('regional source identity differs from release');
const paths=[...new Set([...main.bytes.toString().matchAll(/\/assets\/[A-Za-z0-9_.-]+\.(?:png|bin|json|txt)/g)].map(match=>match[0]))];
const mapAssets=[];
for(const expected of [{file:'manifest.json',sha256:release.manifest_sha256,bytes:release.manifest_bytes},...release.assets]){
 const dot=expected.file.lastIndexOf('.'),stem=expected.file.slice(0,dot),extension=expected.file.slice(dot);let found=false;
 for(const path of paths.filter(path=>path.startsWith(`/assets/${stem}-`)&&path.endsWith(extension))){const item=await asset(path);if(item.sha256!==expected.sha256)continue;if(item.bytes.length!==expected.bytes||!item.bytes.equals(await fs.readFile(`src/regional-assets/${expected.file}`)))throw Error('regional served bytes differ');mapAssets.push({file:expected.file,path,sha256:item.sha256,bytes:item.bytes.length});found=true;break;}
 if(!found)throw Error(`missing exact public regional asset: ${expected.file}`);
}
const lock=JSON.parse(await fs.readFile('package-lock.json','utf8')),renderer=lock.packages['node_modules/pixi.js'];
if(renderer.version!=='8.22.0')throw Error('regional renderer version differs');
const mapping={renderer:'Pixi',version:renderer.version,integrity:renderer.integrity,region_id:manifest.region_id,bundle_version:manifest.version,generator:manifest.generator,generator_source_sha256:manifest.generator_source_sha256,config_hash:manifest.config_hash,manifest_sha256:release.manifest_sha256,mapping_sha256:sha(JSON.stringify(manifest.mapping)),mapping:manifest.mapping,assets:mapAssets};
const definitions=[];
for(const path of ['src/core/engineering.json','src/core/record-engineering.json','src/core/prestart-engineering.json']){
  const bytes=await fs.readFile(path),definition=JSON.parse(bytes),{definition_hash,...body}=definition;
  if(sha(JSON.stringify(body))!==definition_hash||!worker.bytes.includes(Buffer.from(definition_hash)))throw Error('definition fingerprint does not match the served worker');
  for(const key of ['profile','capabilities','rules','catalogs'])if(sha(JSON.stringify(definition[key]))!==definition.hashes[key])throw Error('registered definition hash mismatch');
  if(sha(JSON.stringify([]))!==definition.hashes.media)throw Error('registered media hash mismatch');
  definitions.push({id:definition.id,schema:definition.schema,contract:definition.contract,version:definition.version,definition_hash,hashes:definition.hashes,registry_sha256:sha(JSON.stringify(definition.profile.registry)),source_sha256:sha(bytes)});
}
// Check the full corridor package internally; publish only its lawful public identity.
const corridorDefinition=JSON.parse(await fs.readFile('src/core/play-definition.json')),{definition_hash:corridorPrivateHash,...corridorPayload}=corridorDefinition;
if(sha(JSON.stringify(corridorPayload))!==corridorPrivateHash||!worker.bytes.includes(Buffer.from(corridorPrivateHash)))throw Error('corridor package does not match served worker');
for(const key of ['profile','capabilities','rules','catalogs'])if(sha(JSON.stringify(corridorDefinition[key]))!==corridorDefinition.hashes[key])throw Error('corridor package component mismatch');
if(sha(JSON.stringify([]))!==corridorDefinition.hashes.media)throw Error('corridor media mismatch');
const {map_id,map_version,crs_id,geometry_version}=corridorDefinition.catalogs.map;
const corridor={id:corridorDefinition.id,schema:corridorDefinition.schema,contract:corridorDefinition.contract,version:corridorDefinition.version,geometry:{map_id,map_version,crs_id,geometry_version},rules_hash:corridorDefinition.hashes.rules,scope:'Public corridor identity; private package/source hashes and private message catalog omitted'};
// Verify the complete mission package against the actual Worker without
// publishing private package/source hashes or mechanism-test catalogs.
const missionDefinition=JSON.parse(await fs.readFile('src/core/mission-definition.json')),{definition_hash:missionPrivateHash,...missionPayload}=missionDefinition;
if(sha(JSON.stringify(missionPayload))!==missionPrivateHash||!worker.bytes.includes(Buffer.from(missionPrivateHash)))throw Error('mission package does not match served worker');
for(const key of ['profile','capabilities','rules','catalogs'])if(sha(JSON.stringify(missionDefinition[key]))!==missionDefinition.hashes[key])throw Error('mission package component mismatch');
if(sha(JSON.stringify([]))!==missionDefinition.hashes.media||Object.hasOwn(missionDefinition.catalogs,'decision_history'))throw Error('mission release must omit owned historical fixtures');
const missionGeometry=missionDefinition.catalogs.map;
const mission={id:missionDefinition.id,schema:missionDefinition.schema,contract:missionDefinition.contract,version:missionDefinition.version,geometry:{map_id:missionGeometry.map_id,map_version:missionGeometry.map_version,crs_id:missionGeometry.crs_id,geometry_version:missionGeometry.geometry_version},rules_hash:missionDefinition.hashes.rules,scope:'Public mission identity; private package/source hashes and owned mechanism catalogs omitted'};
// Bind schema9 to the actual served Worker while keeping private source and
// mechanism hashes out of the public CI artifact, as for schemas7 and8.
const intelligenceDefinition=JSON.parse(await fs.readFile('src/core/intelligence-definition.json')),{definition_hash:intelligencePrivateHash,...intelligencePayload}=intelligenceDefinition;
if(sha(JSON.stringify(intelligencePayload))!==intelligencePrivateHash||!worker.bytes.includes(Buffer.from(intelligencePrivateHash)))throw Error('intelligence package does not match served worker');
for(const key of ['profile','capabilities','rules','catalogs'])if(sha(JSON.stringify(intelligenceDefinition[key]))!==intelligenceDefinition.hashes[key])throw Error('intelligence package component mismatch');
if(sha(JSON.stringify([]))!==intelligenceDefinition.hashes.media||intelligenceDefinition.schema!==9||intelligenceDefinition.scenario_kind!=='play_intelligence')throw Error('intelligence release identity differs');
const intelligenceGeometry=intelligenceDefinition.catalogs.map;
const intelligence={id:intelligenceDefinition.id,schema:intelligenceDefinition.schema,contract:intelligenceDefinition.contract,version:intelligenceDefinition.version,geometry:{map_id:intelligenceGeometry.map_id,map_version:intelligenceGeometry.map_version,crs_id:intelligenceGeometry.crs_id,geometry_version:intelligenceGeometry.geometry_version},rules_hash:intelligenceDefinition.hashes.rules,scope:'Public intelligence identity; private package/source hashes and owned mechanism catalogs omitted'};
for(const match of html.matchAll(/href="([^"]+\.css)"/g)){const item=await asset(match[1]);styles.push({path:item.path,sha256:item.sha256});}
const browser=await chromium.launch({headless:true,...(process.env.FB01_BROWSER?{executablePath:process.env.FB01_BROWSER}:{})});
let browserVersion;try{browserVersion=browser.version();}finally{await browser.close();}
const event=process.env.GITHUB_EVENT_PATH?JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH,'utf8')):null;
const optional=async path=>{try{return (await fs.readFile(path,'utf8')).trim();}catch{return null;}};
const fingerprint={tested_sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),worktree_dirty:execFileSync('git',['-C','..','status','--porcelain','--','app','.github'],{encoding:'utf8'}).trim().length>0,pr_head_sha:event?.pull_request?.head?.sha??null,node:process.version,browser:browserVersion,platform:process.platform,architecture:process.arch,workflow_sha256:sha(await fs.readFile('../.github/workflows/fb01.yml')),lock_sha256:sha(await fs.readFile('package-lock.json')),definition_sha256:sha(await fs.readFile('src/core/engineering.json')),definitions,image_id:await optional('image-id.txt'),html_sha256:sha(html),main:{path:main.path,sha256:main.sha256},worker:{path:worker.path,sha256:worker.sha256},styles};
fingerprint.mapping=mapping;
fingerprint.corridor=corridor;
fingerprint.mission=mission;
fingerprint.intelligence=intelligence;
await fs.mkdir('verification-output',{recursive:true});await fs.writeFile('verification-output/fingerprint.json',JSON.stringify(fingerprint,null,2));
console.log(JSON.stringify(fingerprint,null,2));
