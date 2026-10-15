import {legacy_view,legacy_result,legacy_state} from './legacy-branch';
import { expect, test } from "vitest";
import { Game } from "../src/core/game";
import { Persistence } from "../src/core/persistence";
import { engineeringDefinition } from "../src/core/scenario";
import type { Envelope, PlayerView, Intent } from "../src/contracts";
test("one large advance and boundary steps preserve the same causal feedback and resource ledger", async () => {
  async function play(name: string, steps: number[]) {
    const store = new Persistence(name), game = new Game(store);
    let view = legacy_view(await game.create_run(engineeringDefinition, "research", "create"));
    const plan = await game.preview_plan(view.run_id, view.revision, 1);
    view = (legacy_result(await game.issue_order({run_id:view.run_id,operation_id:"issue",expected_revision:view.revision,intent:{kind:"issue",command_id:"move",plan}}))).view;
    for (const to of steps) view = (legacy_result(await game.control_clock({run_id:view.run_id,operation_id:`advance-${to}`,expected_revision:view.revision,intent:{kind:"advance",to}}))).view;
    const result = {position:view.position,resources:view.resources,log:view.log,sim_time:view.sim_time,status:view.status,finished:view.finished};
    await store.delete();
    return result;
  }
  expect(await play("large-step",[33800])).toEqual(await play("boundary-steps",[999,1000,1999,2000,6000,7000,12000,17000,22000,27000,32000,32800,33800]));
});
test("S04/S05 legal feedback lags physical arrival and records independent literal times and resources", async () => {
  const store = new Persistence("move-test"),
    game = new Game(store);
  let view = legacy_view(await game.create_run(engineeringDefinition, "research", "create"));
  const plan = await game.preview_plan(view.run_id, view.revision, 1);
  const order: Envelope = {
    run_id: view.run_id,
    operation_id: "order-1",
    expected_revision: view.revision,
    intent: { kind: "issue", command_id: "command-1", plan },
  };
  const issued = legacy_result(await game.issue_order(order));
  view = issued.view;
  expect(view.status).toBe("queued");
  expect(view.sim_time).toBe(0);
  expect(view.resources.equipment_energy).toBe(16);
  async function advance(to: number) {
    const result = legacy_result(await game.control_clock({
      run_id: view.run_id,
      operation_id: `advance-${to}`,
      expected_revision: view.revision,
      intent: { kind: "advance", to },
    }));
    view = result.view;
    return view;
  }
  expect((await advance(1000)).status).toBe("queued");
  expect((await advance(2000)).status).toBe("executing");
  expect((await advance(6000)).position.x).toBe(50);
  expect((await advance(7000)).position).toMatchObject({
    x: 68.87,
    observed: 6000,
    received: 7000,
  });
  for (const [at, x] of [
    [12000, 87.74],
    [17000, 106.6],
    [22000, 125.47],
    [27000, 144.34],
    [32000, 163.21],
  ])
    expect((await advance(at)).position.x).toBe(x);
  expect((await advance(32800)).finished).toBe(false);
  expect(view.position.x).toBe(163.21);
  expect((await advance(33800)).finished).toBe(true);
  expect(view.position).toMatchObject({
    x: 170,
    observed: 32800,
    received: 33800,
  });
  expect(view.resources).toMatchObject({
    equipment_energy: 8,
    equipment_wear: 92,
    movement_energy: 18,
  });
  const retry = legacy_result(await game.issue_order(order));
  expect(retry.receipt).toEqual(issued.receipt);
  expect((legacy_view(await game.get_view(view.run_id))).resources).toEqual(view.resources);
  await store.delete();
});
test("S07 operation retries are idempotent, changed contents conflict and a second task is not eligible", async () => {
  const store = new Persistence("move-retry"),
    game = new Game(store);
  let view = legacy_view(await game.create_run(engineeringDefinition, "research", "create"));
  const plan = await game.preview_plan(view.run_id, view.revision, 1);
  const envelope: Envelope = {
    run_id: view.run_id,
    operation_id: "issue",
    expected_revision: view.revision,
    intent: { kind: "issue", command_id: "move", plan },
  };
  view = (legacy_result(await game.issue_order(envelope))).view;
  const original = legacy_state(await store.read_committed(view.run_id));
  await expect(
    game.issue_order({
      ...envelope,
      intent: { kind: "issue", command_id: "move", plan, reason: "changed" },
    }),
  ).rejects.toThrow("OPERATION_CONFLICT");
  await expect(
    game.issue_order({ ...envelope, operation_id: "stale" }),
  ).rejects.toThrow("STALE_REVISION");
  const again = await game.preview_plan(view.run_id, view.revision, 2);
  expect(again.allowed).toBe(false);
  await expect(
    game.issue_order({
      run_id: view.run_id,
      operation_id: "new",
      expected_revision: view.revision,
      intent: { kind: "issue", command_id: "another", plan: again },
    }),
  ).rejects.toThrow("ORDER_EXISTS");
  expect(legacy_state(await store.read_committed(view.run_id))).toEqual(original);
  await store.delete();
});
test("S13 grace accepts pre-deadline completion but never permits work finishing after the deadline", async () => {
  async function run(issuedAt: number, name: string) {
    const store = new Persistence(name),
      game = new Game(store);
    let view = legacy_view(await game.create_run(
      engineeringDefinition,
      "research",
      "create",
    ));
    view = (
      legacy_result(await game.control_clock({
        run_id: view.run_id,
        operation_id: "before-issue",
        expected_revision: view.revision,
        intent: { kind: "advance", to: issuedAt },
      }))
    ).view;
    const plan = await game.preview_plan(view.run_id, view.revision, 1);
    view = (
      legacy_result(await game.issue_order({
        run_id: view.run_id,
        operation_id: "issue",
        expected_revision: view.revision,
        intent: { kind: "issue", command_id: "move", plan },
      }))
    ).view;
    view = (
      legacy_result(await game.control_clock({
        run_id: view.run_id,
        operation_id: "finish",
        expected_revision: view.revision,
        intent: { kind: "advance", to: 610000 },
      }))
    ).view;
    await store.delete();
    return view;
  }
  const legal = await run(567199, "grace-legal"),
    late = await run(567201, "grace-late");
  expect(legal.finished).toBe(true);
  expect(legal.position).toMatchObject({ observed: 599999, received: 600999 });
  expect(late.finished).toBe(false);
  expect(late.status).toBe("deadline");
  expect(late.log.some((x) => x.kind === "complete_receipt")).toBe(false);
  const exact = await run(567200, "grace-exact-deadline");
  expect(exact.finished).toBe(false);
  expect(exact.log.some(x=>x.kind==='complete_receipt')).toBe(false);
  const atDeadline=await run(599000,'accept-at-deadline');
  expect(atDeadline.log.some(x=>x.kind==='accepted_receipt')).toBe(false);
});
