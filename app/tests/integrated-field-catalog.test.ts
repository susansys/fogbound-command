import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';

test('NB3-AT001 creates the independent metre model through public Game',async()=>{
  const store=new Persistence('b33-owned-catalog-'+crypto.randomUUID());
  try{
    const game=new Game(store);
    const view=await game.create_run({
      schema:13,contract:'0.5.1',
      package_ref:{id:'INTEGRATED-FIELD-PACK-3',version:1},
    },'research',crypto.randomUUID());
    expect(view).toMatchObject({
      scenario_kind:'play_integrated_field',revision:1,sim_time:0,paused:true,
      model_catalog:{
        model_ref:{id:'INTEGRATED-FIELD-MODEL-3',version:1},
        geometry:{unit:'m',metres_per_coordinate:1,
          points:{H:[50,150],A:[150,150],B:[250,150]},
          segments:[{id:'HA',length_m:100},{id:'AB',length_m:100}]},
      },
    });
    expect(await game.get_view(view.run_id)).toEqual(view);
  }finally{await store.delete();}
});

test('NB3-AT003 includes the G2 battery mass once and exposes independent energy units',async()=>{
  const store=new Persistence('b33-owned-configuration-'+crypto.randomUUID());
  try{
    const view=await new Game(store).create_run({schema:13,contract:'0.5.1',package_ref:{id:'INTEGRATED-FIELD-PACK-3',version:1}},'research',crypto.randomUUID());
    expect(view).toMatchObject({model_catalog:{configurations:[
      {actor:'R',load_kg:4,capacity_l:12,occupied_l:5,storage_bytes:16000000000,
        equipment:{id:'EQ-G2-TU',mass_kg:1.19,battery_included:true,battery_wh:49.704,battery_nominal_j:178934.4,battery_available_j:143147.52}},
      {actor:'W',load_kg:3,capacity_l:12,occupied_l:5,
        equipment:{id:'W-FICTIONAL-TOOL',battery_wh:20,battery_nominal_j:72000,battery_available_j:57600}},
    ]}});
  }finally{await store.delete();}
});

test('NB3-AT002 rejects unsupported units, configurations and extrapolated loads without a partial run',async()=>{
  const store=new Persistence('b33-owned-unsupported-'+crypto.randomUUID()),game=new Game(store);
  try{
    const selector={schema:13,contract:'0.5.1',package_ref:{id:'INTEGRATED-FIELD-PACK-3',version:1}};
    for(const extra of [{unit:'mile'},{configuration_ref:'EQ-G2-UU'},{load:{value:-0.01,unit:'kg'}},{load:{value:8.01,unit:'kg'}},{load_coefficient:0.02}]){
      await expect(game.create_run({...selector,...extra},'research',crypto.randomUUID())).rejects.toThrow('INVALID_DEFINITION');
    }
    expect(await store.list_runs()).toEqual([]);
  }finally{await store.delete();}
});

test('NB3-AT004 distinguishes assumptions from source specifications and technical contracts',async()=>{
  const store=new Persistence('b33-owned-sources-'+crypto.randomUUID());
  try{
    const view=await new Game(store).create_run({schema:13,contract:'0.5.1',package_ref:{id:'INTEGRATED-FIELD-PACK-3',version:1}},'research',crypto.randomUUID());
    expect(view).toMatchObject({model_catalog:{
      calibration_status:'conditional_not_measured',
      parameters:expect.arrayContaining([
        expect.objectContaining({id:'P-R-MASS',value:1.19,unit:'kg',category:'A',source_ref:{id:'R13',version:1}}),
        expect.objectContaining({id:'P-MOVE-HA',value:1,unit:'m/s',category:'C',source_ref:{id:'B33-INTEGRATED-FIELD-DESIGN-1.0.0',version:1},label:'条件情景值，非现实校准'}),
        expect.objectContaining({id:'P-DEADLINE',value:900000,unit:'ms',category:'T',source_ref:{id:'B33-INTEGRATED-FIELD-DESIGN-1.0.0',version:1}}),
      ]),
      sources:expect.arrayContaining([expect.objectContaining({id:'R13',version:1,document_version:'FZ-G2 mk3 AP',publication_date:null,sales_sku:null})]),
    }});
  }finally{await store.delete();}
});

test('S01 command catalogue survives save and explicit restore without advancing while paused',async()=>{
  const store=new Persistence('b33-owned-catalogue-clock-'+crypto.randomUUID());
  try{
    const game=new Game(store),initial=await game.create_run({schema:13,contract:'0.5.1',package_ref:{id:'INTEGRATED-FIELD-PACK-3',version:1}},'command',crypto.randomUUID());
    const ticked=await game.tick(initial.run_id,750,crypto.randomUUID());
    expect(ticked.view).toMatchObject({sim_time:750,paused:false,mode:'command'});
    const saved=await game.save({run_id:initial.run_id,operation_id:crypto.randomUUID(),expected_revision:ticked.view.revision,intent:{kind:'save'}});
    const resumedGame=new Game(store),restored=await resumedGame.restore(initial.run_id,crypto.randomUUID());
    expect(restored.view).toMatchObject({run_id:initial.run_id,sim_time:750,paused:true,mode:'command',model_catalog:expect.objectContaining({model_ref:{id:'INTEGRATED-FIELD-MODEL-3',version:1}})});
    expect(restored.receipt.snapshot_revision).toBe(saved.view.revision);
    await expect(resumedGame.tick(initial.run_id,1000,crypto.randomUUID())).rejects.toThrow('CLOCK_PAUSED');
    const continued=await resumedGame.control_clock({run_id:initial.run_id,operation_id:crypto.randomUUID(),expected_revision:restored.view.revision,intent:{kind:'continue'}});
    const next=await resumedGame.tick(initial.run_id,1000,crypto.randomUUID());
    expect(next.view.sim_time).toBe(1000);
    await expect(resumedGame.control_clock({run_id:initial.run_id,operation_id:crypto.randomUUID(),expected_revision:next.view.revision,intent:{kind:'advance',to:2000}})).rejects.toThrow('MODE_LOCKED');
    expect(continued.view.sim_time).toBe(750);
  }finally{await store.delete();}
});
