// Original fictional terrain. No real geographic data or Game random stream.
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';import zlib from 'node:zlib';
const out=path.resolve(process.argv[2]??'src/regional-assets'),seed=process.argv[3]??'MAP-B-RURAL-20261014-1';
if(process.version!=='v22.23.3')throw Error('Preparation requires the pinned Node22.23.3 tool');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const config={generator:'synthetic-rural-1',seed,regionMetres:10000,gridStep:25,gridWidth:401,gridHeight:401,rasterStep:5,rasterWidth:2000,rasterHeight:2000,tilePixels:512,logicalSectorMetres:2500,overviewPixels:256,mainRiver:{centre:7000,waves:[550,180],floorNorth:60,floorSlope:-0.012,waterHalfWidth:80,flatValleyHalfWidth:180},tributary:{mergeV:7500,northOffset:3500},roadsV:[2400,7400],hillCentres:[[1700,1600],[8600,1800],[1800,8200],[8300,8000],[4200,3600],[3600,7100]],hillScales:{long:[1000,2600],short:[550,1200],rotation:[0,Math.PI]},warp:[145,95,135,65],palette:[[55,71,77],[57,81,67],[77,99,68],[112,122,83],[148,142,104],[176,159,126],[190,176,152]],light:[-0.5,-0.5,0.707],slopeExaggeration:3,notice:'程序生成的虚构区域；不代表任何现实地点'};
const configHash=sha(JSON.stringify(config)),seedWord=crypto.createHash('sha256').update(seed).digest().readUInt32LE(0);
let random=seedWord;const draw=()=>{random^=random<<13;random^=random>>>17;random^=random<<5;return(random>>>0)/4294967296;};
const hills=config.hillCentres.map(([u,v])=>({u:u+(draw()-.5)*240,v:v+(draw()-.5)*240,height:90+draw()*230,su:1000+draw()*1600,sv:550+draw()*650,rotation:draw()*Math.PI}));
const villages=[[1300,2350],[2700,2450],[4800,2350],[8200,2450],[1900,7350],[4400,7450],[8700,7350]];
const mainU=v=>7000+550*Math.sin(2*Math.PI*v/10000)+180*Math.sin(6*Math.PI*v/10000);
const tributaryU=v=>mainU(v)-3500*(1-v/7500);
const riverDistance=(u,v)=>Math.min(Math.abs(u-mainU(v)),v<=7500?Math.abs(u-tributaryU(v)):Infinity);
const values=new Float32Array(401*401),mask=new Uint8Array(values.length).fill(1);
for(let j=0;j<401;j++)for(let i=0;i<401;i++){
 const u=i*25,v=j*25,bed=60-.012*v,d=riverDistance(u,v);
 let h=65+25*Math.sin(u/760+seedWord%19)*Math.cos(v/930);
 const wu=u+145*Math.sin(v/630)+95*Math.sin(u/1100+v/500),wv=v+135*Math.sin(u/660)+65*Math.cos(v/700-u/900);
 for(const hill of hills){const a=wu-hill.u,b=wv-hill.v,co=Math.cos(hill.rotation),si=Math.sin(hill.rotation);h+=hill.height*Math.exp(-(((a*co+b*si)/hill.su)**2+((-a*si+b*co)/hill.sv)**2));}
 const blend=d<=180?0:1-Math.exp(-(((d-180)/460)**2));
 values[j*401+i]=bed+blend*h;
}
const height=Buffer.alloc(values.length*4);for(let i=0;i<values.length;i++)height.writeFloatLE(values[i],i*4);
function sample(u,v){const x=Math.max(0,Math.min(400,u/25)),y=Math.max(0,Math.min(400,v/25)),i=Math.min(399,Math.floor(x)),j=Math.min(399,Math.floor(y)),a=x-i,b=y-j;return(values[j*401+i]*(1-a)+values[j*401+i+1]*a)*(1-b)+(values[(j+1)*401+i]*(1-a)+values[(j+1)*401+i+1]*a)*b;}
let minimum=Infinity,maximum=-Infinity;for(const value of values){minimum=Math.min(minimum,value);maximum=Math.max(maximum,value);}
const low=Math.floor(minimum/50)*50,high=Math.ceil(maximum/50)*50,step=(high-low)/config.palette.length;
const bands=config.palette.map((rgb,index)=>({from:low+index*step,to:low+(index+1)*step,rgb}));
function chunk(type,body){const label=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(body.length);crc.writeUInt32BE(zlib.crc32(Buffer.concat([label,body])));return Buffer.concat([size,label,body,crc]);}
function png(width,height,rgba){const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;const scan=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)Buffer.from(rgba.buffer,rgba.byteOffset+y*width*4,width*4).copy(scan,y*(width*4+1)+1);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(scan,{level:9})),chunk('IEND',Buffer.alloc(0))]);}
function pixel(u,v,grey){
 const h=sample(u,v),dx=(sample(Math.min(10000,u+25),v)-sample(Math.max(0,u-25),v))/(Math.min(10000,u+25)-Math.max(0,u-25)),dy=(sample(u,Math.min(10000,v+25))-sample(u,Math.max(0,v-25)))/(Math.min(10000,v+25)-Math.max(0,v-25));
 const nx=-3*dx,ny=-3*dy,norm=Math.hypot(nx,ny,1),light=Math.max(0,(-.5*nx-.5*ny+.707)/norm),shade=.58+.53*light;
 if(grey){const value=Math.round(255*light);return[value,value,value,255];}
 const band=Math.max(0,Math.min(bands.length-1,Math.floor((h-low)/step))),base=bands[band].rgb,d=riverDistance(u,v);
 const road=config.roadsV.some(row=>Math.abs(v-row)<=14);
 if(road&&d<100)return[172,160,119,255];
 if(d<=80)return[39,78,90,255];
 const land=Math.sin(u/340+seedWord%17)+Math.cos(v/410),stripe=Math.floor((u+v*.25)/30)%2;
 const texture=land>.5?.84:land<-.2?(stripe?.94:1.06):1;
 if(road){return d<100?[172,160,119,255]:[135,128,105,255];}
 for(const [cu,cv] of villages)if(Math.abs(u-cu)<90&&Math.abs(v-cv)<70&&Math.floor(u/25)%2===0&&Math.floor(v/20)%2===0)return[168,139,112,255];
 return[...base.map(value=>Math.max(0,Math.min(255,Math.round(value*shade*texture)))),255];
}
await fs.mkdir(out,{recursive:true});const assets=[];let peakRSS=process.memoryUsage().rss;
async function store(file,body,fields={}){await fs.writeFile(path.join(out,file),body);assets.push({file,bytes:body.length,sha256:sha(body),...fields});peakRSS=Math.max(peakRSS,process.memoryUsage().rss);}
await store('height.bin',height,{kind:'height',width:401,height:401,encoding:'Float32LE'});await store('valid.bin',Buffer.from(mask),{kind:'mask',width:401,height:401});
for(const layer of ['surface','shade'])for(let row=0;row<4;row++)for(let column=0;column<4;column++){
 const px=column*512,py=row*512,width=Math.min(512,2000-px),height=Math.min(512,2000-py),rgba=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)rgba.set(pixel((px+x+.5)*5,(py+y+.5)*5,layer==='shade'),(y*width+x)*4);
 await store(`${layer}-${row}-${column}.png`,png(width,height,rgba),{kind:layer,width,height,u:px*5,v:py*5,extent:[width*5,height*5]});
}
for(const layer of ['surface','shade']){const rgba=new Uint8Array(256*256*4);for(let y=0;y<256;y++)for(let x=0;x<256;x++)rgba.set(pixel((x+.5)*10000/256,(y+.5)*10000/256,layer==='shade'),(y*256+x)*4);await store(`${layer}-overview.png`,png(256,256,rgba),{kind:layer+'-overview',width:256,height:256,u:0,v:0,extent:[10000,10000]});}
const notice='Original procedural fictional countryside, synthetic-rural-1. Not a real place, satellite image, real altitude or military model. Derived only from the project original terrain idea. No external geographic assets or copied system fonts. Runtime library notices are separate. No external distribution license is invented.\n';await store('NOTICE.txt',Buffer.from(notice),{kind:'notice'});
const manifest={schema:1,generator:config.generator,generator_source_sha256:sha(await fs.readFile(new URL(import.meta.url))),region_id:'fictional-rural-region-1',version:1,seed,config,config_hash:configHash,tool:{node:process.version,zlib:process.versions.zlib},mapping:{version:'local-region-1',domain:[0,0,10000,10000],unit:'fictional_metre',axes:['east','south'],scale:1,basis:'relative-fictional-zero'},field:{width:401,height:401,step:25,order:'v-major,u-minor',encoding:'Float32LE',minimum,maximum},bands,decoration:{mainRiver:[0,2500,5000,7500,10000].map(v=>[mainU(v),v]),tributaryMerge:[mainU(7500),7500],roadsV:config.roadsV,villages,bridges:config.roadsV.flatMap(v=>[[mainU(v),v],[tributaryU(v),v]])},assets};
const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');await fs.writeFile(path.join(out,'manifest.json'),manifestBytes);
const release={manifest_sha256:sha(manifestBytes),manifest_bytes:manifestBytes.length,config_hash:configHash,assets:assets.map(a=>({file:a.file,bytes:a.bytes,sha256:a.sha256,width:a.width,height:a.height})),region_id:manifest.region_id,version:1,generator:manifest.generator};
await fs.writeFile(path.join(out,'trusted-release.json'),JSON.stringify(release,null,2)+'\n');
const total=assets.reduce((n,a)=>n+a.bytes,0)+manifestBytes.length+Buffer.byteLength(JSON.stringify(release,null,2)+'\n');peakRSS=Math.max(peakRSS,process.resourceUsage().maxRSS*1024);if(total>32*1024*1024||assets.some(a=>a.bytes>2*1024*1024)||peakRSS>256*1024*1024)throw Error('Preparation budget exceeded');
console.log(JSON.stringify({seed,configHash,manifestHash:release.manifest_sha256,files:assets.length+2,totalBytes:total,peakRSS,peakScope:'whole preparation process RSS; Linux maxRSS plus sampled RSS',minimum,maximum,tool:manifest.tool}));
