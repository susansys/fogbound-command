import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

// Only these published maintenance documents can take the explicit no-runtime-
// change route. Unknown event/base/head/path/type always selects full testing.
const maintenanceDocs=new Set(['README.md','approved-decisions.md','known-issues-and-next.md','public-status.md','sync-contract.md','technical-index.md'].map(name=>'docs/maintenance/'+name));
function classifyChange(){
 const base=process.env.VERIFICATION_BASE,head=process.env.GITHUB_SHA,event=process.env.GITHUB_EVENT_NAME;
 const full=reason=>({docs_only:false,route:'full',reason});
 if(!['push','pull_request'].includes(event)||!/[1-9a-f]/.test(base??'')||!/^([a-f0-9]{40})$/.test(base??'')||!/^([a-f0-9]{40})$/.test(head??''))return full('untrusted_or_missing_event_identity');
 const git=(...args)=>{const result=spawnSync('git',args,{encoding:'utf8',timeout:5000,maxBuffer:4000000});assert.equal(result.status,0);return result.stdout;};
 try{
  if(git('rev-parse','HEAD').trim()!==head)return full('checkout_head_mismatch');
  git('merge-base','--is-ancestor',base,head);
  const changed=git('diff','--no-ext-diff','--no-textconv','--no-renames','--name-only','-z',base,head).split('\0').filter(Boolean);
  if(!changed.length||changed.some(file=>!maintenanceDocs.has(file)))return full('empty_mixed_or_unknown_paths');
  for(const file of changed){
   for(const commit of [base,head])if(!git('ls-tree','-z',commit,'--',file).startsWith('100644 blob '))return full('nonordinary_or_new_file');
   for(let current=path.resolve(file);current!==process.cwd();current=path.dirname(current))if(fs.lstatSync(current).isSymbolicLink())return full('linked_worktree_path');
   if(!fs.lstatSync(file).isFile())return full('nonordinary_worktree_path');
  }
  return {docs_only:true,route:'docs_only',reason:'only_existing_six_maintenance_documents',base,head,changed};
 }catch{return full('unavailable_or_unverifiable_diff');}
}
if(process.argv[2]==='--classify-change'){
 assert.equal(process.argv.length,3);const scope=classifyChange();
 if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'docs_only='+scope.docs_only+'\n');
 const folder=path.resolve('app/verification-output/browser-contract');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'scope.json'),JSON.stringify(scope,null,2)+'\n');
 console.log('FB01_VERIFICATION_SCOPE '+JSON.stringify(scope));process.exit(0);
}

// Fixed from actual discovery. All231 original contracts remain; MB13's
// dynamic Worker bootstrap has one reviewed FIFO correction and updated hash.
// Intentional discovery changes require a reviewed contract change, never runtime regeneration.
const frozen={
  "baseline_sha": "cab208ebd360a55f8fcf55e150e5b7a033f02f59",
  "full_count": 301,
  "full_keys_sha256": "b32657748d6e65461df0ecfb8b25903ae165885b73f25309c6f905a61661bbb0",
  "legacy_count": 231,
  "legacy_keys_sha256": "272a726ad5b0eff5a06b345e202737d5bb292a20f6ed2069a785618a1efef7da",
  "legacy_files": [
    {
      "file": "atomic.spec.ts",
      "sha256": "e916c90b843d7efd6805583f210a14d433fb5e453deec71a0a476d0668dd5c4d"
    },
    {
      "file": "bad-save.spec.ts",
      "sha256": "50620104f2a7f8a08fb2ffc3e9100a99f77e279b54f8a98cdb5d64da79578c5a"
    },
    {
      "file": "clock.spec.ts",
      "sha256": "392eb489e538679fdb43d267ae4a64066adfac591faef6f0d40ab233402efbda"
    },
    {
      "file": "fb03-object-time.spec.ts",
      "sha256": "9fc8db39e6f2fb9d0d36fed14a765d09b91063d6d3697ceaed91acf1daa7a147"
    },
    {
      "file": "intelligence-execution.spec.ts",
      "sha256": "f59e885f1f4bfe7b32dfa2d38dca39d92f014ec25d5297efbeb89e0ede8a22d0"
    },
    {
      "file": "intelligence-language.spec.ts",
      "sha256": "7e7fb6003eef6d9cc20569289034ba1ea2b38d90d6edb111d9baa0430f48888e"
    },
    {
      "file": "intelligence-paths.spec.ts",
      "sha256": "8393108c29a4c599a302c1a0c6ef3e5ecd996c1186f46c22cdf5c78f077d3785"
    },
    {
      "file": "intelligence-recovery.spec.ts",
      "sha256": "fc6248776bca4d8ff245b311c7e829a9384e0fdfdef5dc210b21bad177c636cb"
    },
    {
      "file": "intelligence-source.spec.ts",
      "sha256": "0358757035d37a4decd16216dedbb66619a8ecf42a7cee04f3b2b2f090630559"
    },
    {
      "file": "intelligence-work.spec.ts",
      "sha256": "94033d2731e71fee3266e165756974395a8c36e9782f9acf5ac1827b53b24c93"
    },
    {
      "file": "knowledge-pair.spec.ts",
      "sha256": "f406b8ea73517daaf04bfc972133bc6e6ad6619b8c2b980e732f49e0ea1c937b"
    },
    {
      "file": "language.spec.ts",
      "sha256": "46980b745f0f63fa83baa14cebb3313717b94c2f6f250fb1ddd7e9db19ca2f3e"
    },
    {
      "file": "late-preview.spec.ts",
      "sha256": "285d837d77bfceca74888c2ad1ea076c9e0a540842d2589d6ffe392179fd6b60"
    },
    {
      "file": "live-confirm.spec.ts",
      "sha256": "5f5ac9aa8f7d3e0cbf61bd62c3f20708078baad5bec920b9bdb81d732f95f4d5"
    },
    {
      "file": "local-persistence-boundaries.spec.ts",
      "sha256": "fe246ec29c1af9b69158cf4cf6ccc945526deeaa5b52016003fc95beccdaa1cb"
    },
    {
      "file": "local-persistence.spec.ts",
      "sha256": "07cda1bff9404bf241ea65df5f98e646ac640d03ed45c03f9666686a3f743584"
    },
    {
      "file": "map-b-camera.spec.ts",
      "sha256": "b15eeb3734fb484fb7cd7cab90a96b30130c8e986a6d30cd0e9dea2022ee0689"
    },
    {
      "file": "map-b-elevation.spec.ts",
      "sha256": "56ad94d9519ae54dd99f17dd605e73fc4295f9c40260751abaf39126d8edafc0"
    },
    {
      "file": "map-b-entry.spec.ts",
      "sha256": "ab77752d78dce330d5866241bd268612400216fdd8d832aa5f00d67be4ac0e6b"
    },
    {
      "file": "map-b-outcomes.spec.ts",
      "sha256": "5730d749d294d1501d67adf66e92a120826fc1d008d7b777308ed5b51dc82d96"
    },
    {
      "file": "map-b-projection.spec.ts",
      "sha256": "e3cf50b5178bd00d4176512833c94dedda6002e92b486236aaf31e5c9fd52e83"
    },
    {
      "file": "map-b-restore.spec.ts",
      "sha256": "c1ec5fb983563a140cc05fb39f46efc9cb915210ac1a22e00fa837130130af68"
    },
    {
      "file": "map-b-validation.spec.ts",
      "sha256": "2f1c5077bf0d492f521a95be0e4763ba8bebacac970fa57e3853417872dd2e67"
    },
    {
      "file": "mission-execution.spec.ts",
      "sha256": "f9c2d35a2c8a8cc293e29f003e9da7739fdb6e381a3e7c01517ca11e55e05155"
    },
    {
      "file": "mission-issue.spec.ts",
      "sha256": "bdd84c96dbf34b96d120fb90b57fa551b9b93cbb8f9762be911b8465f0dea719"
    },
    {
      "file": "mission-records.spec.ts",
      "sha256": "8fc92999224de8749e11375545e69f9feee61fa9f8dbc1d919373885816ff729"
    },
    {
      "file": "mission-save.spec.ts",
      "sha256": "f398a0c58c78b32661a756d99e2846aab2595e5568c9b489c6801ea4c2c0015e"
    },
    {
      "file": "move.spec.ts",
      "sha256": "3eff8f0dcf9a39b62884a1749c1861c4dfbaa0f7596b7b64fa1a212915bb571f"
    },
    {
      "file": "play-final-matrix.spec.ts",
      "sha256": "4e8932f90da998c235ef812461f185a8045c560e9eadab59133750c55b2e3a28"
    },
    {
      "file": "play-history.spec.ts",
      "sha256": "ae81d3bdd79b7ccc6708f2815637e2fd5fa7ff1cfac1763d96f33bfe36709947"
    },
    {
      "file": "play-movement.spec.ts",
      "sha256": "ff4447ae982adac01f07a8599139f11a4e9b35bb9215d408d81dcfad0261434b"
    },
    {
      "file": "play-route.spec.ts",
      "sha256": "1f5e5a58c7e4e479806aacd62e945e71eee649d16745baaa122bf7fdba6dae35"
    },
    {
      "file": "play-scopes.spec.ts",
      "sha256": "e2737b27a4578a55cfb901a7be370b328f015d5756a5b72ac750de306b47ddf0"
    },
    {
      "file": "prestart-atomic.spec.ts",
      "sha256": "771eb845b2dc0d7e34e2e3ee4c4392e6e293ceeed4f5b9e1b0ac4499b13bbf34"
    },
    {
      "file": "prestart-outcomes.spec.ts",
      "sha256": "d1f406868472649a78e4d7b748f3cb872dcdb5446545cc5fdbb1d9a3822f7a87"
    },
    {
      "file": "prestart-resume.spec.ts",
      "sha256": "1b59081445352bb1934bb98fa6235ebcfd0bb037a55ff8805ed66d1abb6fe6cd"
    },
    {
      "file": "prestart-visual.spec.ts",
      "sha256": "e640217f392cf2e230c4c7c31c9616e6921e4101b46e5970d440b2ed20bfe644"
    },
    {
      "file": "prestart.spec.ts",
      "sha256": "33c112086ff8fd95790cef4843463ae0a250db4cb26e17e36f5db6d7ad94c0a6"
    },
    {
      "file": "preview.spec.ts",
      "sha256": "946a8b7f437ef13184770ff29d5b1e7270a5b14d98367d18200d90c8f53d5c5f"
    },
    {
      "file": "readable-records.spec.ts",
      "sha256": "c1da1ae8785aa1abf25f88d437edb4032295c5ee1fa3099f1375c2d0fa94836c"
    },
    {
      "file": "reconfirm.spec.ts",
      "sha256": "b6b770b317adc987cc751a08e22b4d2435731b58bd84976f927fe9622dec429f"
    },
    {
      "file": "record-execution.spec.ts",
      "sha256": "bc1640820ca5c73b0ce945b967aed24d375ae6e1ddd83f8a98d75c8a1427c579"
    },
    {
      "file": "record-fault.spec.ts",
      "sha256": "80cf2f03a48167b983ff266326596429b723fdedd919bddb5b26228973084432"
    },
    {
      "file": "record-language.spec.ts",
      "sha256": "58664ab1f2808dc60b71a2fb5ed0dba732b661f665044361e3a8d8530091c1e2"
    },
    {
      "file": "record-map.spec.ts",
      "sha256": "4d8fd5d6fb301e0df3463ad413a2ee57a4b514400df0210b6bab1083f5bec102"
    },
    {
      "file": "record-preview.spec.ts",
      "sha256": "0c4fbb9b40d8957cdf041785c6acf230be2bbe408adbaf49c5a96f9b9d2a894c"
    },
    {
      "file": "record-resume.spec.ts",
      "sha256": "b2cf8e7a1003a413fbd768b3eae4121da2e01e33d78992b2773c462ec660906c"
    },
    {
      "file": "record-start.spec.ts",
      "sha256": "ecf1a9a9f2aa670ca760c116af02e34edd330e8b4f72dac4ebe6cbc5df5f5802"
    },
    {
      "file": "replay.spec.ts",
      "sha256": "cfdb187588a5206b951c7e7878e228d1ae330c3e387215932ea977dacf7724be"
    },
    {
      "file": "save.spec.ts",
      "sha256": "6d3ff3972339716f93a15955d715ce173f895e5d9d9a05e19af99c215449b37f"
    },
    {
      "file": "start.spec.ts",
      "sha256": "53350a391e4dcfc397ed82b130e8c867b65f73ef9e6f83a6bb3e507de57d30c6"
    },
    {
      "file": "task-workspace.spec.ts",
      "sha256": "b88284d5a3286338418d47603427395865197d8dc1cb9e60983f113890d9ab42"
    },
    {
      "file": "transport.spec.ts",
      "sha256": "365398a8296a7e522a72fd2b2ad25bd1ea29bec6e4f174b0d317adee4c301f2a"
    }
  ],
  "windows": [
    {
      "file": "outcome-compatibility.spec.ts",
      "title": "B24 E44/E45/E46 chrome actual returning, partial handover and pending verification receipt survive six same-profile full-process closures",
      "key": "[\"outcome-compatibility.spec.ts\",\"\",[\"outcome-compatibility.spec.ts\",\"B24 E44/E45/E46 chrome actual returning, partial handover and pending verification receipt survive six same-profile full-process closures\"]]"
    },
    {
      "file": "outcome-compatibility.spec.ts",
      "title": "B24 E44/E45/E46 edge actual returning, partial handover and pending verification receipt survive six same-profile full-process closures",
      "key": "[\"outcome-compatibility.spec.ts\",\"\",[\"outcome-compatibility.spec.ts\",\"B24 E44/E45/E46 edge actual returning, partial handover and pending verification receipt survive six same-profile full-process closures\"]]"
    },
    {
      "file": "outcome-integration.spec.ts",
      "title": "B24 E41 default installed Windows chrome completes actual A path through evidence debrief and same-profile full-process recovery",
      "key": "[\"outcome-integration.spec.ts\",\"\",[\"outcome-integration.spec.ts\",\"B24 E41 default installed Windows chrome completes actual A path through evidence debrief and same-profile full-process recovery\"]]"
    },
    {
      "file": "outcome-integration.spec.ts",
      "title": "B24 E42 default installed Windows chrome completes actual B path through evidence debrief and same-profile full-process recovery",
      "key": "[\"outcome-integration.spec.ts\",\"\",[\"outcome-integration.spec.ts\",\"B24 E42 default installed Windows chrome completes actual B path through evidence debrief and same-profile full-process recovery\"]]"
    },
    {
      "file": "outcome-integration.spec.ts",
      "title": "B24 E41 default installed Windows edge completes actual A path through evidence debrief and same-profile full-process recovery",
      "key": "[\"outcome-integration.spec.ts\",\"\",[\"outcome-integration.spec.ts\",\"B24 E41 default installed Windows edge completes actual A path through evidence debrief and same-profile full-process recovery\"]]"
    },
    {
      "file": "outcome-integration.spec.ts",
      "title": "B24 E42 default installed Windows edge completes actual B path through evidence debrief and same-profile full-process recovery",
      "key": "[\"outcome-integration.spec.ts\",\"\",[\"outcome-integration.spec.ts\",\"B24 E42 default installed Windows edge completes actual B path through evidence debrief and same-profile full-process recovery\"]]"
    },
    {
      "file": "outcome-recovery.spec.ts",
      "title": "B24 E11/E59 native chrome full-process close preserves the same reception and resumes only explicitly",
      "key": "[\"outcome-recovery.spec.ts\",\"\",[\"outcome-recovery.spec.ts\",\"B24 E11/E59 native chrome full-process close preserves the same reception and resumes only explicitly\"]]"
    },
    {
      "file": "outcome-recovery.spec.ts",
      "title": "B24 E11/E59 native edge full-process close preserves the same reception and resumes only explicitly",
      "key": "[\"outcome-recovery.spec.ts\",\"\",[\"outcome-recovery.spec.ts\",\"B24 E11/E59 native edge full-process close preserves the same reception and resumes only explicitly\"]]"
    },
    {
      "file": "outcome-termination.spec.ts",
      "title": "B24 joint E03/E20/E22 native chrome keeps moving W unacknowledged across full process closure and explicit continuation",
      "key": "[\"outcome-termination.spec.ts\",\"\",[\"outcome-termination.spec.ts\",\"B24 joint E03/E20/E22 native chrome keeps moving W unacknowledged across full process closure and explicit continuation\"]]"
    },
    {
      "file": "outcome-termination.spec.ts",
      "title": "B24 joint E03/E20/E22 native edge keeps moving W unacknowledged across full process closure and explicit continuation",
      "key": "[\"outcome-termination.spec.ts\",\"\",[\"outcome-termination.spec.ts\",\"B24 joint E03/E20/E22 native edge keeps moving W unacknowledged across full process closure and explicit continuation\"]]"
    },
    {
      "file": "outcome-termination.spec.ts",
      "title": "B24 E26 native IDB transaction_abort preserves the actual commit boundary and queries the original abort",
      "key": "[\"outcome-termination.spec.ts\",\"\",[\"outcome-termination.spec.ts\",\"B24 E26 native IDB transaction_abort preserves the actual commit boundary and queries the original abort\"]]"
    },
    {
      "file": "outcome-termination.spec.ts",
      "title": "B24 E26 native IDB response_loss preserves the actual commit boundary and queries the original abort",
      "key": "[\"outcome-termination.spec.ts\",\"\",[\"outcome-termination.spec.ts\",\"B24 E26 native IDB response_loss preserves the actual commit boundary and queries the original abort\"]]"
    },
    {
      "file": "outcome-truth.spec.ts",
      "title": "B24 E30/E38 chrome default installed Windows browser fully closes its owned process tree and restores the same sealed run, template, note and exposure on the same profile/origin",
      "key": "[\"outcome-truth.spec.ts\",\"\",[\"outcome-truth.spec.ts\",\"B24 E30/E38 chrome default installed Windows browser fully closes its owned process tree and restores the same sealed run, template, note and exposure on the same profile/origin\"]]"
    },
    {
      "file": "outcome-truth.spec.ts",
      "title": "B24 E30/E38 edge default installed Windows browser fully closes its owned process tree and restores the same sealed run, template, note and exposure on the same profile/origin",
      "key": "[\"outcome-truth.spec.ts\",\"\",[\"outcome-truth.spec.ts\",\"B24 E30/E38 edge default installed Windows browser fully closes its owned process tree and restores the same sealed run, template, note and exposure on the same profile/origin\"]]"
    }
  ]
};

const listOnly=process.argv[2]==='--list-only';
assert(process.argv.length===(listOnly?3:2));
assert.equal(process.env.FB01_HEADED,'1','Keep the headed browser contract');
const cli=path.resolve('node_modules/@playwright/test/cli.js'),started=Date.now();
const keys=rows=>rows.map(row=>row.key).sort(),ids=rows=>rows.map(row=>row.id).sort();
const digest=values=>crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex');
function rows(report){const found=[];function visit(suite,parents=[]){for(const spec of suite.specs??[])for(const test of spec.tests){const file=spec.file.replaceAll('\\','/'),names=[...parents,spec.title];found.push({id:spec.id+':'+test.projectId,key:JSON.stringify([file,test.projectId,names]),file,title:spec.title,test});}for(const child of suite.suites??[])visit(child,[...parents,child.title.replaceAll('\\','/')]);}for(const suite of report.suites)visit(suite,[suite.title.replaceAll('\\','/')]);return found.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);}
function checkConfig(report){assert.deepEqual(report.errors,[]);assert.equal(report.config.workers,1);assert.equal(report.config.projects.length,1);assert(report.config.projects.every(project=>project.retries===0&&project.repeatEach===1));assert.equal(report.config.shard,null,'The complete portable contract runs in one job');}
function discover(filters=[]){const result=spawnSync(process.execPath,[cli,'test','--list','--reporter=json',...filters],{encoding:'utf8',maxBuffer:8000000,env:{...process.env,PLAYWRIGHT_JSON_OUTPUT_FILE:'',PLAYWRIGHT_JSON_OUTPUT_NAME:''}});const report=JSON.parse(result.stdout);assert.equal(result.status,0,result.stderr||JSON.stringify(report.errors));checkConfig(report);return rows(report);}
const full=discover();assert.equal(full.length,frozen.full_count);assert.equal(new Set(keys(full)).size,frozen.full_count);assert.equal(digest(keys(full)),frozen.full_keys_sha256,'Review every discovery addition/removal/title change against the fixed contract');
for(const item of frozen.legacy_files)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join('browser',item.file))).digest('hex'),item.sha256,'The original231 source must remain intact: '+item.file);
const legacyFiles=new Set(frozen.legacy_files.map(item=>item.file)),legacy=full.filter(row=>legacyFiles.has(row.file));assert.equal(legacy.length,frozen.legacy_count);assert.equal(digest(keys(legacy)),frozen.legacy_keys_sha256,'No original regression may be omitted');
const nativeKeys=new Set(frozen.windows.map(item=>item.key)),native=full.filter(row=>nativeKeys.has(row.key));assert.equal(native.length,14);assert.equal(new Set(frozen.windows.map(item=>item.title)).size,14);assert.deepEqual(keys(native),[...nativeKeys].sort());
const portable=full.filter(row=>!nativeKeys.has(row.key)),windowsHost=process.platform==='win32',expected=windowsHost?full:portable;
const escape=value=>value.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&');
const nativeExclusionPattern=frozen.windows.map(item=>'(?:^| )'+escape(item.title)+'$').join('|'),filters=windowsHost?[]:['--grep-invert',nativeExclusionPattern];
const discoveryMs=Date.now()-started;
const artifactDir=path.resolve('verification-output/browser-contract');fs.mkdirSync(artifactDir,{recursive:true});
const manifest={jobs:1,workers:1,retries:0,baseline_sha:frozen.baseline_sha,legacy_count:legacy.length,full_count:full.length,portable_count:portable.length,windows_required_count:native.length,native_exclusion_pattern:nativeExclusionPattern,execution_platform:process.platform,planned_execution_count:expected.length,windows_obligation:windowsHost?'Executing actual cases; final default-Windows receipts still require source/artifact binding.':'Not executed on this platform; required separate final-SHA Windows proof, never counted as passed.',full_keys_sha256:digest(keys(full)),tests:full.map(({id,key,file,title})=>({id,key,file,title,obligation:nativeKeys.has(key)?'windows_required':'portable'})),discovery_ms:discoveryMs};
fs.writeFileSync(path.join(artifactDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const {tests,native_exclusion_pattern,...manifestSummary}=manifest;
// Discovery-only is an existing captured machine interface, never a CI log.
console.log('FB01_BROWSER_MANIFEST '+JSON.stringify(listOnly?manifest:{...manifestSummary,artifact:'verification-output/browser-contract/manifest.json'}));
if(!listOnly){
 const selected=filters.length?discover(filters):full;assert.deepEqual(keys(selected),keys(expected),'The exact native whitelist is the only platform selection');assert.deepEqual(keys(expected.filter(row=>legacyFiles.has(row.file))),keys(legacy));
 const output=path.join(artifactDir,'result.json');assert(!fs.existsSync(output),'An old browser report cannot serve as a new result');
 const result=spawnSync(process.execPath,[cli,'test',...filters,'--reporter=list,json'],{stdio:'inherit',env:{...process.env,PLAYWRIGHT_JSON_OUTPUT_FILE:output}});
 if(!fs.existsSync(output)){
  const missing={status:result.signal?'cancelled':'unknown',reason:result.error?.message??'Missing browser execution report',expected_count:expected.length,actual_passed_count:null,exit:result.status,signal:result.signal};
  fs.writeFileSync(path.join(artifactDir,'summary.json'),JSON.stringify(missing,null,2)+'\n');console.log('FB01_BROWSER_RESULT '+JSON.stringify(missing));assert.fail('Missing browser report is not a pass');
 }
 const report=JSON.parse(fs.readFileSync(output)),actual=rows(report),passed=actual.filter(row=>row.test.expectedStatus==='passed'&&row.test.results.length===1&&row.test.results[0].status==='passed');
 const failed=actual.filter(row=>row.test.results.some(result=>['failed','timedOut'].includes(result.status))),cancelled=actual.filter(row=>row.test.results.some(result=>result.status==='interrupted')),notRun=actual.filter(row=>!row.test.results.length||row.test.results.every(result=>result.status==='skipped'));
 let validationError;
 try{checkConfig(report);assert.equal(result.status,0,'Failed or interrupted execution cannot pass');assert.deepEqual(keys(actual),keys(expected));assert.deepEqual(ids(actual),ids(selected));assert.deepEqual(keys(passed),keys(expected),'No skipped, retried or unfinished executed test may pass');}catch(error){validationError=error.message;}
 const summary={status:result.signal?'cancelled':validationError?'failed':'passed',validation_error:validationError??null,expected_count:expected.length,legacy_required_count:231,actual_passed_count:passed.length,failed_count:failed.length,cancelled_count:cancelled.length,not_run_count:notRun.length,unknown_count:actual.length-passed.length-failed.length-cancelled.length-notRun.length,passed_ids:ids(passed),passed_keys_sha256:digest(keys(passed)),unpassed_ids:actual.filter(row=>!passed.includes(row)).map(row=>row.id),windows_target_not_run_here:windowsHost?[]:frozen.windows.map(item=>({file:item.file,title:item.title,status:'required_not_run_on_this_platform'})),exit:result.status,signal:result.signal,elapsed_ms:Date.now()-started,browser_ms:report.stats.duration,discovery_ms:discoveryMs};
 fs.writeFileSync(path.join(artifactDir,'summary.json'),JSON.stringify(summary,null,2)+'\n');
 const {passed_ids,unpassed_ids,windows_target_not_run_here,validation_error,...shortSummary}=summary;
 console.log('FB01_BROWSER_RESULT '+JSON.stringify({...shortSummary,windows_required_not_run_here:windows_target_not_run_here.length,artifact:'verification-output/browser-contract/'}));
 assert.equal(validationError,undefined,'Browser execution and identity must both pass; see summary artifact');
}
