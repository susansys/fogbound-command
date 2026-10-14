import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';
const lock=JSON.parse(await fs.readFile('package-lock.json','utf8')),rows=[],missing=[];let output='Current locked runtime dependency notices\n\nMap imagery and simulated data are original fictional material. This document does not invent a project distribution licence or include system fonts.\n';
for(const [directory,item] of Object.entries(lock.packages)){
 if(!directory||item.dev)continue;let names;try{names=await fs.readdir(directory);}catch{missing.push(directory+' unavailable');continue;}
 const pkg=JSON.parse(await fs.readFile(path.join(directory,'package.json'),'utf8')),files=names.filter(name=>/^(licen[cs]e|copying|notice)(?:\.|$)/i.test(name));
 const extra=[];
 if(!files.length&&names.includes('README.md')){
   const readme=await fs.readFile(path.join(directory,'README.md'),'utf8'),start=readme.indexOf('## License (MIT)');
   if(start>=0&&readme.slice(start).includes('THE SOFTWARE IS PROVIDED'))extra.push({file:'README.md license section',text:readme.slice(start)});
 }
 if(!files.length&&!extra.length&&pkg.name==='@pixi/colord'&&pkg.version==='2.9.6')extra.push({file:'upstream LICENSE.md blob e437003733acd123c76c2a9df0c13a6f3b02b51e',text:await fs.readFile('THIRD_PARTY_LICENSES/colord-upstream-MIT.txt','utf8')});
 if(!files.length&&!extra.length){missing.push(pkg.name+'@'+pkg.version);continue;}
 output+=`\n\n===== ${pkg.name}@${pkg.version} =====\n`;
 const sources=[];for(const file of files){const text=await fs.readFile(path.join(directory,file),'utf8');output+=`\n--- ${file} ---\n${text}`;sources.push({file,sha256:crypto.createHash('sha256').update(text).digest('hex')});}
 for(const {file,text} of extra){output+=`\n--- ${file} ---\n${text}`;sources.push({file,sha256:crypto.createHash('sha256').update(text).digest('hex')});}
 rows.push({name:pkg.name,version:pkg.version,declaredLicence:pkg.license,sources});
}
await fs.mkdir('THIRD_PARTY_LICENSES',{recursive:true});await fs.writeFile('THIRD_PARTY_LICENSES/current-runtime-notices.txt',output.replace(/\r\n/g,'\n'));
console.log(JSON.stringify({included:rows.length,missing,rows}));if(missing.length)process.exitCode=1;
