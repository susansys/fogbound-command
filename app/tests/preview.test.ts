import {legacy_view,legacy_state} from './legacy-branch';
import { expect, test } from "vitest";
import { Game } from "../src/core/game";
import { Persistence } from "../src/core/persistence";
import { engineeringDefinition } from "../src/core/scenario";
test("S03 preview exposes the registered corridor estimate without reserving or consuming anything", async () => {
  const store = new Persistence("preview-test"),
    game = new Game(store);
  const view = legacy_view(await game.create_run(
    engineeringDefinition,
    "research",
    "create",
  ));
  const before = legacy_state(await store.read_committed(view.run_id));
  const plan = await game.preview_plan(view.run_id, view.revision, 7);
  expect(plan).toMatchObject({
    distance: 120,
    estimated_move_ms: 31800,
    link_ms: 1000,
    actor: "R",
    target: "T",
    path: "H-T",
    editing_seq: 7,
    allowed: true,
  });
  expect(legacy_state(await store.read_committed(view.run_id))).toEqual(before);
  await expect(game.preview_plan(view.run_id, 0, 7)).rejects.toThrow(
    "STALE_REVISION",
  );
  await store.delete();
});
