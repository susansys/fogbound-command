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
import { load_definition } from "./scenario";
import type { State } from "./state";
import { project_player_view } from "./knowledge";
import { valid_id, valid_envelope } from "../protocol";
import { hash } from "./scenario";
import { advance_move, register_move } from "./movement";
export class Game {
  private epoch: number | null = null;
  constructor(readonly store: Persistence) {}
  private async writer() {
    if (this.epoch === null) this.epoch = await this.store.claim_writer();
    return this.epoch;
  }
  async create_run(
    input: unknown,
    mode: Mode,
    operation: string,
  ): Promise<PlayerView> {
    const definition = await load_definition(input);
    if (!["command", "research"].includes(mode) || !valid_id(operation))
      throw new GameError("INVALID_INPUT");
    const previous = await this.store.creation(operation);
    if (previous) {
      if (previous.fingerprint !== `create:${mode}`)
        throw new GameError("OPERATION_CONFLICT");
      const snapshot = await this.store.snapshot(
        previous.run_id,
        previous.revision,
      );
      if (!snapshot) throw new GameError("STORAGE_UNCONFIRMED");
      return project_player_view(snapshot);
    }
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
      source_run: null,
      schema: 4,
      contract: "0.5.1",
      definition_hash: definition.definition_hash,
      hashes: definition.hashes,
      rng: {
        algorithm: "xorshift32-v1",
        version: 1,
        seed: 1,
        state: 1,
        origin: run_id,
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
          text: "原始工位报告已递交；R最后确认在H。",
          evidence: "DELIVERY-T",
        },
      ],
    };
    await this.store.commit_batch(
      state,
      epoch,
      null,
      operation,
      `create:${mode}`,
    );
    return project_player_view(state);
  }
  async get_view(run: string): Promise<PlayerView> {
    const state = await this.store.read_committed(run);
    if (!state) throw new GameError("RUN_NOT_FOUND");
    return project_player_view(state);
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
    const state = await this.store.read_committed(run);
    if (!state) throw new GameError("RUN_NOT_FOUND");
    const view = project_player_view(state);
    if (view.revision !== revision) throw new GameError("STALE_REVISION");
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
    if (envelope?.intent?.kind !== "issue")
      throw new GameError("INVALID_INPUT");
    return this.operate(envelope);
  }
  async get_receipt(
    run: string,
    operation_id: string,
  ): Promise<Receipt | null> {
    if(!valid_id(run)||!valid_id(operation_id))throw new GameError('INVALID_INPUT');
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
    };
  }
  async control_clock(
    envelope: Envelope,
    clock_to?:number,
  ): Promise<{ receipt: Receipt; view: PlayerView }> {
    if (!['advance','pause','continue','rate','mode'].includes(envelope?.intent?.kind))
      throw new GameError("INVALID_INPUT");
    return this.operate(envelope,clock_to);
  }
  async tick(run:string,to:number,operation_id:string):Promise<{receipt:Receipt;view:PlayerView}> {
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
    if (!valid_envelope(envelope)) throw new GameError("INVALID_INPUT");
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
        },
        view: await this.get_view(envelope.run_id),
      };
    }
    const state = await this.store.read_committed(envelope.run_id);
    if (!state) throw new GameError("RUN_NOT_FOUND");
    if (state.revision !== envelope.expected_revision)
      throw new GameError("STALE_REVISION");
    const candidate = structuredClone(state);
    if(clock_to!==undefined){
      if(state.mode!=='command'||state.paused||!Number.isSafeInteger(clock_to)||clock_to<state.sim_time||clock_to>610000)throw new GameError('INVALID_INPUT');
      if(clock_to>state.sim_time&&!state.ended)advance_move(candidate,clock_to);
    }
    if (envelope.intent.kind === "issue") {
      const intent = envelope.intent;
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
    } else if(envelope.intent.kind==='pause') candidate.paused=true;
    else if(envelope.intent.kind==='continue') {
      if(state.mode!=='command')throw new GameError('MODE_LOCKED');
      if(state.ended)throw new GameError('RUN_ENDED');
      candidate.paused=false;
    } else if(envelope.intent.kind==='rate') candidate.rate=envelope.intent.rate;
    else if(envelope.intent.kind==='mode')throw new GameError('MODE_LOCKED');
    else throw new GameError("INVALID_INPUT");
    candidate.revision = state.revision + 1;
    candidate.inputs.push({
      envelope: structuredClone(envelope),
      at: clock_to===undefined?state.sim_time:candidate.sim_time,
      revision: candidate.revision,
      ...(clock_to===undefined?{}:{clock_to}),
    });
    await this.store.commit_batch(
      candidate,
      await this.writer(),
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
      },
      view: project_player_view(candidate),
    };
  }
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
