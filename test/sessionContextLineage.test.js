import assert from "node:assert/strict";
import test from "node:test";
import {
  boundedContextPacketContext,
  contextPacketIdsForCall,
  contextPacketsForCall,
  contextSourceCountForCall
} from "../server/sessionContextLineage.js";

test("session continuations retain bounded unique context packet lineage", () => {
  const call = {
    contextPacketId: "packet-current",
    contextPacketIds: ["packet-original", "packet-current", "packet-original"]
  };
  assert.deepEqual(contextPacketIdsForCall(call), ["packet-original", "packet-current"]);
});

test("context lineage resolves available packets and aggregates their source counts", () => {
  const db = {
    contextPackets: [
      { id: "packet-original", sourceCount: 1, context: "Imported implementation plan" },
      { id: "packet-current", sourceCount: 2, context: "Current checkpoint evidence" }
    ]
  };
  const call = { contextPacketId: "packet-current", contextPacketIds: ["packet-original", "missing"] };
  assert.deepEqual(contextPacketsForCall(db, call).map((packet) => packet.id), ["packet-original", "packet-current"]);
  assert.equal(contextSourceCountForCall(db, call), 3);
});

test("combined packet context preserves every packet within the global bound", () => {
  const context = boundedContextPacketContext([
    { context: "ORIGINAL-PLAN " + "a".repeat(2_000) },
    { context: "CURRENT-CHECKPOINT " + "b".repeat(2_000) }
  ], 1_200);
  assert.match(context, /ORIGINAL-PLAN/);
  assert.match(context, /CURRENT-CHECKPOINT/);
  assert.ok(context.length <= 1_200);
});
