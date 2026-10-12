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
for(const match of html.matchAll(/href="([^"]+\.css)"/g)){const item=await asset(match[1]);styles.push({path:item.path,sha256:item.sha256});}
const browser=await chromium.launch({headless:true,...(process.env.FB01_BROWSER?{executablePath:process.env.FB01_BROWSER}:{})});
let browserVersion;try{browserVersion=browser.version();}finally{await browser.close();}
const event=process.env.GITHUB_EVENT_PATH?JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH,'utf8')):null;
const optional=async path=>{try{return (await fs.readFile(path,'utf8')).trim();}catch{return null;}};
const fingerprint={tested_sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),worktree_dirty:execFileSync('git',['-C','..','status','--porcelain','--','app','.github'],{encoding:'utf8'}).trim().length>0,pr_head_sha:event?.pull_request?.head?.sha??null,node:process.version,browser:browserVersion,platform:process.platform,architecture:process.arch,workflow_sha256:sha(await fs.readFile('../.github/workflows/fb01.yml')),lock_sha256:sha(await fs.readFile('package-lock.json')),definition_sha256:sha(await fs.readFile('src/core/engineering.json')),image_id:await optional('image-id.txt'),html_sha256:sha(html),main:{path:main.path,sha256:main.sha256},worker:{path:worker.path,sha256:worker.sha256},styles};
await fs.mkdir('verification-output',{recursive:true});await fs.writeFile('verification-output/fingerprint.json',JSON.stringify(fingerprint,null,2));
console.log(JSON.stringify(fingerprint,null,2));
