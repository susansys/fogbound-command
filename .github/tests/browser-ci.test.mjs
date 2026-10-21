import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {cpSync,mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const root=fileURLToPath(new URL('../../',import.meta.url)),app=path.join(root,'app');
const wrapper=readFileSync(path.join(app,'verification/browser-contract.mjs'),'utf8');
const frozen=JSON.parse(wrapper.slice(wrapper.indexOf('const frozen=')+13,wrapper.indexOf('\n};')+2));
const discovered=spawnSync(process.execPath,[path.join(app,'node_modules/@playwright/test/cli.js'),'test','--list','--reporter=json'],{cwd:app,encoding:'utf8',maxBuffer:8000000,timeout:60000,env:{...process.env,PLAYWRIGHT_JSON_OUTPUT_FILE:'',PLAYWRIGHT_JSON_OUTPUT_NAME:''}});
assert.equal(discovered.status,0,discovered.stderr);const discovery=JSON.parse(discovered.stdout);

// Exercise the actual wrapper with an external CLI fixture. No browser, game,
// Docker, network or user database runs here; discovery still uses Playwright.
const cli=String.raw`
const fs=require('node:fs'),args=process.argv.slice(2),r=JSON.parse(fs.readFileSync('discovery.json'));
const pattern=args.includes('--grep-invert')?new RegExp(args[args.indexOf('--grep-invert')+1]):null;
let index=0,stopped=false;
function visit(s){s.specs=(s.specs||[]).filter(x=>!pattern||!pattern.test(x.title));for(const spec of s.specs)for(const t of spec.tests){t.expectedStatus='passed';let status='passed';if(process.env.WRAPPER_FIXTURE==='fail'&&index===0)status='failed';if(stopped)status='skipped';t.results=[{status}];index++;if(status==='failed'&&args.includes('--max-failures=1'))stopped=true;}for(const c of s.suites||[])visit(c);}
for(const s of r.suites)visit(s);r.stats={duration:1};
if(args.includes('--list')){process.stdout.write(JSON.stringify(r));process.exit(0);}
if(process.env.WRAPPER_FIXTURE==='missing')process.exit(2);
if(process.env.WRAPPER_FIXTURE==='wrong-identity')r.suites[0].specs[0].id='unregistered-identity';
fs.writeFileSync(process.env.PLAYWRIGHT_JSON_OUTPUT_FILE,JSON.stringify(r));
process.exit(process.env.WRAPPER_FIXTURE==='fail'?1:0);
`;
function run(mode){
 const dir=mkdtempSync(path.join(tmpdir(),'fogbound-browser-contract-'));
 try{
  mkdirSync(path.join(dir,'verification'),{recursive:true});writeFileSync(path.join(dir,'verification/browser-contract.mjs'),wrapper);
  mkdirSync(path.join(dir,'node_modules/@playwright/test'),{recursive:true});writeFileSync(path.join(dir,'node_modules/@playwright/test/cli.js'),cli);
  mkdirSync(path.join(dir,'browser'));for(const f of frozen.legacy_files)cpSync(path.join(app,'browser',f.file),path.join(dir,'browser',f.file));
  writeFileSync(path.join(dir,'discovery.json'),JSON.stringify(discovery));
  const result=spawnSync(process.execPath,['verification/browser-contract.mjs',...(mode==='list'?['--list-only']:[])],{cwd:dir,encoding:'utf8',maxBuffer:8000000,timeout:30000,env:{...process.env,FB01_HEADED:'1',RUNNER_TEMP:dir,TEMP:dir,WRAPPER_FIXTURE:mode}});
  const base=path.join(dir,'verification-output/browser-contract');
  const artifact=name=>existsSync(path.join(base,name))?JSON.parse(readFileSync(path.join(base,name))):null;
  return {result,manifest:artifact('manifest.json'),report:artifact('result.json'),summary:artifact('summary.json')};
 }finally{assert(path.dirname(dir)===path.resolve(tmpdir())&&path.basename(dir).startsWith('fogbound-browser-contract-'));rmSync(dir,{recursive:true});}
}
test('one browser failure retains later independent results and a nonzero gate',()=>{
 const {result,manifest,report,summary}=run('fail');assert.notEqual(result.status,0);
 assert.ok(manifest,'full manifest is an artifact even when execution fails');assert.ok(report,'raw report remains available');assert.ok(summary);
 const expected=process.platform==='win32'?325:307;
 assert.equal(summary.expected_count,expected);assert.equal(summary.actual_passed_count,expected-1);assert.equal(summary.failed_count,1);assert.equal(summary.not_run_count,0);assert.equal(summary.status,'failed');
 assert.equal(summary.passed_ids.length,expected-1);assert.equal(manifest.tests.length,325);
 assert(result.stdout.split('\n').every(line=>Buffer.byteLength(line)<4096),'machine summaries must not hit the GitHub 64KiB line limit');
});
test('all required cases pass only with complete raw and identity artifacts',()=>{
 const {result,manifest,report,summary}=run('pass');assert.equal(result.status,0,result.stderr);assert.ok(report);assert.equal(summary.status,'passed');assert.equal(summary.actual_passed_count,summary.expected_count);assert.equal(manifest.legacy_count,231);
});
test('missing execution report is unknown evidence and cannot pass',()=>{
 const {result,manifest,report,summary}=run('missing');assert.notEqual(result.status,0);assert.ok(manifest);assert.equal(report,null);assert.equal(summary.status,'unknown');assert.equal(summary.actual_passed_count,null);
});
test('an exit-zero report with the right count but the wrong identity cannot publish passed evidence',()=>{
 const {result,summary}=run('wrong-identity');assert.notEqual(result.status,0);assert.equal(summary.status,'failed');assert.equal(summary.actual_passed_count,summary.expected_count);assert.ok(summary.validation_error);
});
test('the existing captured discovery interface keeps full tests and native selection fields',()=>{
 const {result}=run('list');assert.equal(result.status,0,result.stderr);const manifest=JSON.parse(result.stdout.split('\n').find(line=>line.startsWith('FB01_BROWSER_MANIFEST ')).slice(22));assert.equal(manifest.tests.length,325);assert.equal(typeof manifest.native_exclusion_pattern,'string');
});

test('only a verified diff of the six existing ordinary maintenance docs selects the explicit docs route',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'fogbound-docs-route-'));
 const git=(...args)=>{const r=spawnSync('git',args,{cwd:dir,encoding:'utf8',timeout:10000});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 try{
  git('init','--quiet');git('config','user.name','CI contract');git('config','user.email','ci-contract@example.invalid');
  mkdirSync(path.join(dir,'docs/maintenance'),{recursive:true});writeFileSync(path.join(dir,'docs/maintenance/README.md'),'baseline\n');writeFileSync(path.join(dir,'runtime.txt'),'baseline\n');git('add','.');git('commit','--quiet','-m','base');const base=git('rev-parse','HEAD');
  writeFileSync(path.join(dir,'docs/maintenance/README.md'),'updated\n');git('add','.');git('commit','--quiet','-m','docs');const head=git('rev-parse','HEAD');
  const classify=(env={})=>{const r=spawnSync(process.execPath,[path.join(app,'verification/browser-contract.mjs'),'--classify-change'],{cwd:dir,encoding:'utf8',timeout:15000,env:{...process.env,GITHUB_OUTPUT:path.join(dir,'scope-output'),GITHUB_EVENT_NAME:'pull_request',VERIFICATION_BASE:base,GITHUB_SHA:git('rev-parse','HEAD'),...env}});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout.trim().slice('FB01_VERIFICATION_SCOPE '.length));};
  assert.equal(classify().docs_only,true);
  assert.equal(classify({VERIFICATION_BASE:''}).docs_only,false);assert.equal(classify({VERIFICATION_BASE:'0'.repeat(40)}).docs_only,false);assert.equal(classify({VERIFICATION_BASE:'f'.repeat(40)}).docs_only,false);
  assert.equal(classify({GITHUB_SHA:'f'.repeat(40)}).docs_only,false);assert.equal(classify({GITHUB_EVENT_NAME:'workflow_dispatch'}).docs_only,false);
  assert.equal(classify({VERIFICATION_BASE:head}).docs_only,false);
  writeFileSync(path.join(dir,'runtime.txt'),'changed\n');git('add','runtime.txt');git('commit','--quiet','-m','mixed runtime');assert.equal(classify().docs_only,false);
  for(const file of ['app/src/change.ts','.github/workflows/change.yml','unknown.txt','docs/maintenance/public-status.md']){
   const prior=git('rev-parse','HEAD');mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});writeFileSync(path.join(dir,file),'unknown\n');git('add',file);git('commit','--quiet','-m','non-doc-or-new-file');assert.equal(classify({VERIFICATION_BASE:prior}).docs_only,false);
  }
  const ordinary=git('rev-parse','HEAD'),blob=git('hash-object','-w','runtime.txt');git('update-index','--add','--cacheinfo','120000,'+blob+',docs/maintenance/README.md');git('commit','--quiet','-m','nonordinary doc');assert.equal(classify({VERIFICATION_BASE:ordinary}).docs_only,false);
 }finally{assert(path.dirname(dir)===path.resolve(tmpdir())&&path.basename(dir).startsWith('fogbound-docs-route-'));rmSync(dir,{recursive:true});}
});
test('workflow keeps quality boundaries and always publishes full browser results',()=>{
 const workflow=readFileSync(path.join(root,'.github/workflows/fb01.yml'),'utf8').replaceAll('\r\n','\n');
 const quality=workflow.split('  quality:\n')[1].split('  browser-contract:\n')[0],browser=workflow.split('  browser-contract:\n')[1];
 assert.match(quality,/timeout-minutes: 15/);assert.doesNotMatch(browser,/timeout-minutes:/);
 assert.match(browser,/- name: Browser contract results\n\s+if: always\(\)/);assert.match(browser,/app\/verification-output\/browser-contract/);
 assert.doesNotMatch(wrapper,/--max-failures/);assert.match(workflow,/Remove the exact owned test container and unused image/);
 assert.equal((workflow.match(/name: Documentation-only result/g)||[]).length,2);assert.equal((workflow.match(/run: node app\/verification\/browser-contract.mjs --classify-change/g)||[]).length,2);
 assert.doesNotMatch(workflow,/paths-ignore:|continue-on-error:/);
 for(const job of [quality,browser])for(const step of job.split('      - ').slice(1))if(/run: npm |run: npx |uses: actions\/setup-node|name: Run browser|name: Build the tested|name: Serve the same/.test(step))assert.match(step,/if: steps.scope.outputs.docs_only != 'true'/);
 const config=readFileSync(path.join(app,'playwright.config.ts'),'utf8');assert.match(config,/workers: 1/);assert.match(config,/retries: 0/);assert.doesNotMatch(config,/timeout:\s*0/);
});
