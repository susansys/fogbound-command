import type {
  Mode,
  PlayerView,
  OriginalReport,
  Plan,
  Envelope,
  Receipt,
} from "../contracts";
import { GameError } from "../contracts";
import { Persistence } from "./persistence";
import { load_definition,definition_for_package,record_definition_for_package } from "./scenario";
import type { State } from "./state";
import { project_player_view,reconstruct_known } from "./knowledge";
import { valid_id, valid_envelope } from "../protocol";
import { hash } from "./scenario";
import { advance_move, register_move } from "./movement";
import {canonical,validate_state} from './snapshot';
import {replay_state} from './replay';
export class Game {
  private epoch: number | null = null;
  private faulted=false;
  private history:State|null=null;
  constructor(readonly store: Persistence) {}
  private assert_current(){if(this.history)throw new GameError('HISTORY_READ_ONLY');}
  private async assert_writable(run:string){this.assert_current();if(await this.store.is_read_only(run))throw new GameError('HISTORY_READ_ONLY');}
  async restart_run(run:string,operation:string):Promise<PlayerView>{
    this.assert_current();if(!valid_id(run)||!valid_id(operation))throw new GameError('INVALID_INPUT');
    const source=await this.store.read_committed(run);if(!source)throw new GameError('RUN_NOT_FOUND');await validate_state(source);
    return this.create(definition_for_package(source.schema,source.definition_hash),source.mode,operation,source);
  }
  async get_replay(run:string,to:number):Promise<Game>{
    if(!valid_id(run)||!Number.isSafeInteger(to)||to<0)throw new GameError('INVALID_INPUT');
    const latest=await this.store.read_committed(run),initial=await this.store.snapshot(run,1);
    if(!latest||!initial)throw new GameError('RUN_NOT_FOUND');
    await validate_state(latest);await validate_state(initial);
    if(to>latest.sim_time)throw new GameError('INVALID_INPUT');
    const context=new Game(this.store);context.history=replay_state(initial,latest.inputs,to);return context;
  }
  private async writer() {
    if (this.epoch === null) this.epoch = await this.store.claim_writer();
    return this.epoch;
  }
  private async commit(state:State,expected:number|null,operation_id:string,fingerprint:string){
    try{await this.store.commit_batch(state,await this.writer(),expected,operation_id,fingerprint);}
    catch(error){
      if(error instanceof GameError&&['STALE_REVISION','HISTORY_READ_ONLY'].includes(error.code))throw error;
      this.faulted=true;
      throw new GameError(error instanceof GameError&&error.code==='STALE_WRITER'?'STALE_WRITER':'STORAGE_UNCONFIRMED');
    }
  }
  async create_run(
    input: unknown,
    mode: Mode,
    operation: string,
  ): Promise<PlayerView> {
    return this.create(input,mode,operation);
  }
  private async create(input:unknown,mode:Mode,operation:string,source:State|null=null):Promise<PlayerView>{
    this.assert_current();
    const definition = await load_definition(input);
    if (!["command", "research"].includes(mode) || !valid_id(operation))
      throw new GameError("INVALID_INPUT");
    const creationFingerprint=source
      ? `clone:${source.run_id}:${definition.id}:${definition.definition_hash}:${mode}`
      : `create:${definition.id}:${definition.definition_hash}:${mode}`;
    const previous = await this.store.creation(operation);
    if (previous) {
      const snapshot = await this.store.snapshot(
        previous.run_id,
        previous.revision,
      );
      if (!snapshot) throw new GameError("STORAGE_UNCONFIRMED");
      await validate_state(snapshot);
      const legacyFingerprint=source?`clone:${source.run_id}:${mode}`:`create:${mode}`;
      if(snapshot.definition_hash!==definition.definition_hash||snapshot.mode!==mode||snapshot.source_run!==(source?.run_id??null)||
        previous.fingerprint!==creationFingerprint&&!(snapshot.schema===4&&previous.fingerprint===legacyFingerprint))
        throw new GameError('OPERATION_CONFLICT');
      return project_player_view(snapshot);
    }
    if(this.faulted)throw new GameError('STORAGE_UNCONFIRMED');
    if(source)await this.assert_writable(source.run_id);
    const epoch = await this.writer(),
      run_id = crypto.randomUUID();
    const state: State = {
      run_id,
      revision: 1,
      sim_time: 0,
      mode,
      rate: 1,
      paused: mode === "research",
      finished: false,
      ended: false,
      status: "ready",
      order: null,
      world: {
        position: {
          xn: definition.catalogs.position.x,
          yn: definition.catalogs.position.y,
          d: 1,
        },
        equipment_energy: definition.profile.parameters.equipment_energy,
        equipment_wear: definition.profile.parameters.equipment_wear,
        movement_energy: definition.profile.parameters.movement_energy,
        sends: 0,
        completed: false,
        stopped: false,
      },
      schedule: [
        {
          id: "objective-deadline",
          at: definition.profile.parameters.deadline,
          phase: 30,
          generation: epoch,
          kind: "deadline",
        },
      ],
      inputs: [],
      movement_rules: {fix_ms:definition.profile.parameters.fix_ms,task_expiry_ms:definition.profile.parameters.task_expiry_ms},
      source_run: source?.run_id??null,
      schema: definition.schema as 4 | 5,
      ...(definition.schema === 5 ? {scenario_kind:'record' as const} : {}),
      contract: "0.5.1",
      definition_hash: definition.definition_hash,
      hashes: definition.hashes,
      rng: {
        algorithm: "xorshift32-v1",
        version: 1,
        seed: 1,
        state: 1,
        origin: source?.rng.origin??run_id,
        used: false,
      },
      generation: epoch,
      phase: "committed",
      public_rules: {
        geometry: {
          H: definition.catalogs.geometry.H as [number, number],
          T: definition.catalogs.geometry.T as [number, number],
          extent: definition.profile.parameters.extent as [number, number],
          corridor_width: definition.profile.parameters.corridor_width,
          plain: definition.catalogs.geometry.plain as [
            number,
            number,
            number,
            number,
          ],
          rough: definition.catalogs.geometry.rough as [
            number,
            number,
            number,
            number,
          ],
        },
        authority: {
          from: definition.catalogs.authority.from,
          to: definition.catalogs.authority.to,
        },
        preview: {
          distance: Math.hypot(
            definition.catalogs.geometry.T[0] -
              definition.catalogs.geometry.H[0],
            definition.catalogs.geometry.T[1] -
              definition.catalogs.geometry.H[1],
          ) as 120,
          estimated_move_ms: definition.profile.parameters.move_ms as 31800,
          link_ms: definition.profile.parameters.link_ms as 1000,
        },
      },
      known: {
        position: definition.catalogs.position,
        report: definition.catalogs.report as OriginalReport,
        delivery: definition.catalogs.delivery,
        resources: {
          equipment_energy: definition.profile.parameters.equipment_energy,
          equipment_wear: definition.profile.parameters.equipment_wear,
          movement_energy: definition.profile.parameters.movement_energy,
          confirmed_at: 0,
        },
      },
      log: [
        {
          id: "initial-report",
          at: 0,
          kind: "report",
          text: definition.schema === 5 ? "档案任务简报已递交；R最后确认在工位H。" : "原始工位报告已递交；R最后确认在H。",
          evidence: definition.catalogs.delivery.id,
        },
      ],
    };
    await this.commit(
      state,
      null,
      operation,
      creationFingerprint,
    );
    return project_player_view(state);
  }
  async get_view(run: string): Promise<PlayerView> {
    if(this.history){if(run!==this.history.run_id)throw new GameError('RUN_NOT_FOUND');return reconstruct_known(this.history);}
    const state = await this.store.read_committed(run);
    if (!state) throw new GameError("RUN_NOT_FOUND");
    await validate_state(state);
    const view=project_player_view(state);
    if(await this.store.is_read_only(run)){view.can_issue=false;view.next_action='查看保留的行动记录';view.gap='这场行动已保留为只读记录';}
    return view;
  }
  async restore(run:string,operation_id:string):Promise<{receipt:Receipt;view:PlayerView}>{
    this.assert_current();
    if(!valid_id(run)||!valid_id(operation_id))throw new GameError('INVALID_INPUT');
    await this.assert_writable(run);
    const state=await this.store.read_committed(run);
    if(!state)throw new GameError('RUN_NOT_FOUND');
    const snapshot=await this.store.snapshot(run,state.revision);
    await validate_state(state);await validate_state(snapshot);
    if(snapshot?.integrity!==state.integrity)throw new GameError('INVALID_SAVE');
    const prior=await this.store.receipt(run,operation_id);
    if(prior){const snapshot=await this.store.snapshot(run,prior.revision);const input=snapshot?.inputs.find(x=>x.envelope.operation_id===operation_id)?.envelope;
      if(!input||input.intent.kind!=='restore')throw new GameError('OPERATION_CONFLICT');return this.operate(input);
    }
    this.faulted=false;
    return this.operate({run_id:run,operation_id,expected_revision:state.revision,intent:{kind:'restore',snapshot_revision:state.revision}});
  }
  async save(envelope:Envelope,clock_to?:number){
    this.assert_current();
    if(envelope?.intent?.kind!=='save')throw new GameError('INVALID_INPUT');
    return this.operate(envelope,clock_to);
  }
  async preview_plan(
    run: string,
    revision: number,
    editing_seq: number,
  ): Promise<Plan> {
    if (
      !valid_id(run) ||
      !Number.isSafeInteger(revision) ||
      !Number.isSafeInteger(editing_seq) ||
      editing_seq < 0
    )
      throw new GameError("INVALID_INPUT");
    const state = this.history?.run_id===run?this.history:await this.store.read_committed(run);
    if (!state) throw new GameError("RUN_NOT_FOUND");
    await validate_state(state);
    const view = project_player_view(state);
    if (view.revision !== revision) throw new GameError("STALE_REVISION");
    if(state.schema===5){
      const definition=record_definition_for_package(state.schema,state.definition_hash),p=definition.profile.parameters;
      return {kind:'record',run_id:run,revision,editing_seq,version:1,actor:'R',target:'A',station:'H',definition_hash:state.definition_hash,
        report_id:view.report.id,delivery_id:view.delivery.id,setup_ms:p.setup_ms,work:p.record_work,
        estimated_record_ms:p.record_work*p.record_ms_per_work,estimated_total_ms:p.setup_ms+p.record_work*p.record_ms_per_work+2*p.link_ms,
        link_ms:1000,record_energy:p.record_energy_cost,record_wear:p.record_first_wear,record_packs:p.record_pack_cost,allowed:view.can_issue,gap:view.can_issue?'':view.gap};
    }
    return {
      run_id: run,
      revision,
      editing_seq,
      version: 1,
      actor: "R",
      target: "T",
      path: "H-T",
      ...state.public_rules.preview,
      allowed: view.can_issue,
      gap: view.can_issue ? "" : view.gap,
    };
  }
  async issue_order(
    envelope: Envelope,
  ): Promise<{ receipt: Receipt; view: PlayerView }> {
    this.assert_current();
    if (envelope?.intent?.kind !== "issue")
      throw new GameError("INVALID_INPUT");
    return this.operate(envelope);
  }
  async get_receipt(
    run: string,
    operation_id: string,
  ): Promise<Receipt | null> {
    if(!valid_id(run)||!valid_id(operation_id))throw new GameError('INVALID_INPUT');
    if(this.history&&run!==this.history.run_id)throw new GameError('RUN_NOT_FOUND');
    if(this.history&&!this.history.inputs.some(x=>x.envelope.operation_id===operation_id))return null;
    const row = await this.store.receipt(run, operation_id);
    if (!row) return null;
    const state = await this.store.snapshot(run, row.revision),
      input = state?.inputs.find(
        (x) => x.envelope.operation_id === operation_id,
      );
    if (!input) throw new GameError("INVALID_INPUT");
    return {
      run_id: row.run_id,
      operation_id: row.operation_id,
      revision: row.revision,
      sim_time: row.sim_time,
      fingerprint: row.fingerprint,
      result: "committed",
      kind: input.envelope.intent.kind,
      ...(input.envelope.intent.kind==='restore'?{snapshot_revision:input.envelope.intent.snapshot_revision}:{}),
    };
  }
  async control_clock(
    envelope: Envelope,
    clock_to?:number,
  ): Promise<{ receipt: Receipt; view: PlayerView }> {
    this.assert_current();
    if (!['advance','pause','continue','rate','mode'].includes(envelope?.intent?.kind))
      throw new GameError("INVALID_INPUT");
    return this.operate(envelope,clock_to);
  }
  async tick(run:string,to:number,operation_id:string):Promise<{receipt:Receipt;view:PlayerView}> {
    this.assert_current();
    const prior=await this.store.receipt(run,operation_id);
    if(prior){
      const snapshot=await this.store.snapshot(run,prior.revision);
      const input=snapshot?.inputs.find(x=>x.envelope.operation_id===operation_id)?.envelope;
      if(!input||input.intent.kind!=='tick'||input.intent.to!==to)throw new GameError('OPERATION_CONFLICT');
      return this.operate(input);
    }
    const view=await this.get_view(run);
    return this.operate({run_id:run,operation_id,expected_revision:view.revision,intent:{kind:'tick',to}});
  }
  private async operate(
    envelope: Envelope,
    clock_to?:number,
  ): Promise<{ receipt: Receipt; view: PlayerView }> {
    this.assert_current();
    if (!valid_envelope(envelope)) throw new GameError("INVALID_INPUT");
    await this.assert_writable(envelope.run_id);
    const fingerprint = await hash(canonical(envelope));
    const previous = await this.store.receipt(
      envelope.run_id,
      envelope.operation_id,
    );
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new GameError("OPERATION_CONFLICT");
      return {
        receipt: {
          run_id: previous.run_id,
          operation_id: previous.operation_id,
          revision: previous.revision,
          sim_time: previous.sim_time,
          fingerprint: previous.fingerprint,
          result: "committed",
          kind: envelope.intent.kind,
          ...(envelope.intent.kind==='restore'?{snapshot_revision:envelope.intent.snapshot_revision}:{}),
        },
        view: await this.get_view(envelope.run_id),
      };
    }
    if(this.faulted)throw new GameError('STORAGE_UNCONFIRMED');
    const state = await this.store.read_committed(envelope.run_id);
    if (!state) throw new GameError("RUN_NOT_FOUND");
    if (state.revision !== envelope.expected_revision)
      throw new GameError("STALE_REVISION");
    await validate_state(state);
    const candidate = structuredClone(state);
    if(clock_to!==undefined){
      if(state.mode!=='command'||state.paused||!Number.isSafeInteger(clock_to)||clock_to<state.sim_time||clock_to>610000)throw new GameError('INVALID_INPUT');
      if(clock_to>state.sim_time&&!state.ended)advance_move(candidate,clock_to);
    }
    if (envelope.intent.kind === "issue") {
      const intent = envelope.intent;
      if ('kind' in intent.plan) throw new GameError("INVALID_INPUT");
      if (state.order) throw new GameError("ORDER_EXISTS");
      const expected = await this.preview_plan(
        state.run_id,
        state.revision,
        intent.plan.editing_seq,
      );
      if (
        JSON.stringify(canonical(expected)) !==
        JSON.stringify(canonical(intent.plan))
      )
        throw new GameError("STALE_PLAN");
      if (!expected.allowed) throw new GameError("AUTHORITY_EXPIRED");
      register_move(candidate, intent);
    } else if (envelope.intent.kind === "advance" || envelope.intent.kind==='tick') {
      if (state.mode !== (envelope.intent.kind==='tick'?'command':'research')) throw new GameError("MODE_LOCKED");
      if(envelope.intent.kind==='tick'&&state.paused)throw new GameError('CLOCK_PAUSED');
      if (envelope.intent.to < state.sim_time)
        throw new GameError("TIME_REVERSED");
      if(envelope.intent.to===state.sim_time)throw new GameError('TIME_NOT_ADVANCED');
      if (state.ended) throw new GameError("RUN_ENDED");
      advance_move(candidate, envelope.intent.to);
    } else if(envelope.intent.kind==='pause'||envelope.intent.kind==='restore') candidate.paused=true;
    else if(envelope.intent.kind==='continue') {
      if(state.mode!=='command')throw new GameError('MODE_LOCKED');
      if(candidate.ended)throw new GameError('RUN_ENDED');
      candidate.paused=false;
    } else if(envelope.intent.kind==='rate') candidate.rate=envelope.intent.rate;
    else if(envelope.intent.kind==='save'){/* the committed snapshot is the save point */}
    else if(envelope.intent.kind==='mode')throw new GameError('MODE_LOCKED');
    else throw new GameError("INVALID_INPUT");
    candidate.revision = state.revision + 1;
    candidate.inputs.push({
      envelope: structuredClone(envelope),
      at: clock_to===undefined?state.sim_time:candidate.sim_time,
      revision: candidate.revision,
      ...(clock_to===undefined?{}:{clock_to}),
    });
    await this.commit(
      candidate,
      state.revision,
      envelope.operation_id,
      fingerprint,
    );
    return {
      receipt: {
        run_id: state.run_id,
        operation_id: envelope.operation_id,
        revision: candidate.revision,
        sim_time: candidate.sim_time,
        fingerprint,
        result: "committed",
        kind: envelope.intent.kind,
        ...(envelope.intent.kind==='restore'?{snapshot_revision:envelope.intent.snapshot_revision}:{}),
      },
      view: project_player_view(candidate),
    };
  }
}
