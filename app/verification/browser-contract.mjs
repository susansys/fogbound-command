import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const listOnly=process.argv[2]==='--list-only';
assert(process.argv.length===(listOnly?3:2));
assert.equal(process.env.FB01_HEADED,'1','Keep the headed browser contract');
const cli=path.resolve('node_modules/@playwright/test/cli.js');
const ids=tests=>tests.map(test=>test.id).sort();
const digest=values=>crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex');
function rows(report){
  const found=[];
  function visit(suite){
    for(const spec of suite.specs??[])for(const test of spec.tests)found.push({id:spec.id+':'+test.projectId,file:spec.file,title:spec.title,test});
    for(const child of suite.suites??[])visit(child);
  }
  for(const suite of report.suites)visit(suite);
  return found.sort((a,b)=>a.id.localeCompare(b.id));
}
function checkConfig(report){
  assert.deepEqual(report.errors,[]);assert.equal(report.config.workers,1);
  assert.equal(report.config.projects.length,1);
  assert(report.config.projects.every(project=>project.retries===0&&project.repeatEach===1));
  assert.equal(report.config.shard,null,'The complete contract runs in one job');
}
const started=Date.now(),listed=spawnSync(process.execPath,[cli,'test','--list','--reporter=json'],{encoding:'utf8',maxBuffer:8000000,env:{...process.env,PLAYWRIGHT_JSON_OUTPUT_FILE:'',PLAYWRIGHT_JSON_OUTPUT_NAME:''}});
assert.equal(listed.status,0,listed.stderr);const discovery=JSON.parse(listed.stdout);checkConfig(discovery);
const expected=rows(discovery),expectedIds=ids(expected);assert.equal(expected.length,231);assert.equal(new Set(expectedIds).size,231);
const discoveryMs=Date.now()-started;
console.log('FB01_BROWSER_MANIFEST '+JSON.stringify({jobs:1,full_count:231,full_ids_sha256:digest(expectedIds),tests:expected.map(({id,file,title})=>({id,file,title})),discovery_ms:discoveryMs}));
if(!listOnly){
  const folder=process.env.RUNNER_TEMP??process.env.TEMP;assert(folder&&path.isAbsolute(folder));
  const output=path.join(folder,'fb01-browser-contract-'+process.pid+'.json');assert(!fs.existsSync(output));
  const result=spawnSync(process.execPath,[cli,'test','--max-failures=1','--reporter=list,json'],{stdio:'inherit',env:{...process.env,PLAYWRIGHT_JSON_OUTPUT_FILE:output}});
  assert(fs.existsSync(output),'Missing browser report is not a pass');
  const report=JSON.parse(fs.readFileSync(output)),actual=rows(report),passed=actual.filter(row=>row.test.expectedStatus==='passed'&&row.test.results.length===1&&row.test.results[0].status==='passed');
  console.log('FB01_BROWSER_RESULT '+JSON.stringify({expected_count:231,actual_passed_count:passed.length,passed_ids:ids(passed),unpassed_ids:actual.filter(row=>!passed.includes(row)).map(row=>row.id),exit:result.status,elapsed_ms:Date.now()-started,browser_ms:report.stats.duration,discovery_ms:discoveryMs}));
  checkConfig(report);assert.equal(result.status,0,'Failed or interrupted execution cannot pass');
  assert.deepEqual(ids(actual),expectedIds);assert.deepEqual(ids(passed),expectedIds,'No skipped, retried or unfinished test may pass');
}
