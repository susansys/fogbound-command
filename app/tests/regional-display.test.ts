import {test,expect} from 'vitest';
import {RegionalDisplayStore,type RegionalDisplayRecord} from '../src/regional-display';

test('MB19 current display association requires committed write and exact readback without touching Game storage',async()=>{
 const store=new RegionalDisplayStore('owned-display-test');
 const record:RegionalDisplayRecord={id:'operation-1',run_id:'run-1',association_revision:1,identity:{region_id:'region-1',domain:[0,0,10000,10000],unit:'fictional_metre',axes:['east','south'],version:1,manifestHash:'a'.repeat(64),mapping:'local-region-1',configHash:'b'.repeat(64),geometryDigest:'c'.repeat(64)},preferences:{camera:[0,0,1],mode:'surface',background:true,terrain:true,labels:true}};
 expect(await store.write(record,null)).toEqual(record);expect(await store.read(record.run_id)).toEqual(record);
 await expect(store.write({...record,id:'operation-2'},null)).rejects.toMatchObject({code:'CONFLICT'});
 expect(await store.read(record.run_id)).toEqual(record);
 store.close();
});
