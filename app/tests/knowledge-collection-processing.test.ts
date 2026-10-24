import {expect,test} from 'vitest';
import {create_intel_work,queue_intel_work,advance_intel_work,start_intel_work,cancel_intel_work} from '../src/core/knowledge-collection-work';

// KA-E07 is the approved scheduler mechanism identity. Actual H/INTEL Game consumers follow in T03.
test('KA-E07 uses one INTEL pool for preparation, processing and verification with stable FIFO',()=>{
  const pool=create_intel_work();
  const preparation=queue_intel_work(pool,{id:'prepare',kind:'preparation',eligible_at:0,work_ms:10000});
  const processing=queue_intel_work(pool,{id:'process',kind:'processing',eligible_at:1000,work_ms:20000});
  const verification=queue_intel_work(pool,{id:'verify',kind:'verification',eligible_at:1000,work_ms:20000});
  expect([preparation.ticket,processing.ticket,verification.ticket]).toEqual([1,2,3]);
  expect(pool).toMatchObject({resource_ref:'INTEL',capacity:1,at:0});
  start_intel_work(pool);
  advance_intel_work(pool,10000);
  expect(preparation).toMatchObject({resource_ref:'INTEL',status:'completed',used_ms:10000,completed_at:10000});
  expect(processing).toMatchObject({status:'queued',used_ms:0});
  // Completion/release precedes received controls and the subsequent start phase at the same SimTime.
  expect(cancel_intel_work(pool,'process')).toBe('cancelled');
  start_intel_work(pool);
  expect(verification).toMatchObject({resource_ref:'INTEL',status:'processing',started_at:10000,used_ms:0});
  advance_intel_work(pool,15000);
  expect(cancel_intel_work(pool,'verify')).toBe('already_started');
  expect(verification).toMatchObject({status:'processing',used_ms:5000});
  advance_intel_work(pool,30000);
  expect(verification).toMatchObject({status:'completed',used_ms:20000,completed_at:30000});
  expect(processing).toMatchObject({status:'cancelled',used_ms:0,ticket:2});
  expect(pool.jobs.filter(job=>job.status==='processing')).toHaveLength(0);
  expect(pool.jobs.reduce((used,job)=>used+job.used_ms,0)).toBe(30000);
});

test('KA-E07 preserves tickets, consumed work and resource identity through recovery and coarse/fine advancement',()=>{
  const pool=create_intel_work();
  queue_intel_work(pool,{id:'later-ticket',kind:'verification',eligible_at:2000,work_ms:20000});
  queue_intel_work(pool,{id:'earlier-eligible',kind:'processing',eligible_at:1000,work_ms:10000});
  start_intel_work(pool);
  advance_intel_work(pool,6500);
  expect(pool.jobs.find(job=>job.id==='earlier-eligible')).toMatchObject({status:'processing',started_at:1000,used_ms:5500});
  const recovered=JSON.parse(JSON.stringify(pool));
  advance_intel_work(pool,40000);
  for(const at of [7000,11000,11001,15000,21000,31000,40000]){advance_intel_work(recovered,at);start_intel_work(recovered);}
  expect(recovered).toEqual(pool);
  expect(pool.jobs.map(job=>[job.id,job.ticket,job.started_at,job.completed_at,job.used_ms])).toEqual([
    ['later-ticket',1,11000,31000,20000],['earlier-eligible',2,1000,11000,10000],
  ]);
  expect(()=>queue_intel_work(pool,{id:'later-ticket',kind:'processing',eligible_at:40000,work_ms:1})).toThrow('INVALID_REQUEST');
  expect(()=>advance_intel_work(pool,39999)).toThrow('INVALID_INPUT');
});
