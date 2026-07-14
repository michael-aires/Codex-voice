import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSessionResumePacket,
  formatSessionResumeContext
} from "../server/sessionResume.js";

test("resume packet captures decisions, unresolved questions, actions, recent turns, and work", () => {
  const packet = buildSessionResumePacket({
    call: {
      id: "call-2",
      threadId: "call-1",
      continuationIndex: 1,
      title: "Rep velocity requirements",
      projectId: "project-1",
      projectTitle: "Rep velocity",
      transcript: [
        { speaker: "Michael", text: "We need first-touch logging to happen within an hour.", at: "2026-07-13T16:00:00.000Z" },
        { speaker: "Cooper", text: "What should happen when enrichment is unavailable?", at: "2026-07-13T16:01:00.000Z" },
        { speaker: "Michael", text: "We decided to use a visible fallback queue with an audit trail.", at: "2026-07-13T16:02:00.000Z" },
        { speaker: "Michael", text: "Next, we need to define the owner and acceptance criteria.", at: "2026-07-13T16:03:00.000Z" }
      ]
    },
    artifacts: [
      { id: "a1", title: "Scoped requirements", kind: "aires_requirements", outputType: "html", createdAt: "2026-07-13T16:04:00.000Z" }
    ],
    jobs: [
      { id: "j1", title: "Service blueprint", status: "running", statusLine: "Building backstage lanes.", updatedAt: "2026-07-13T16:05:00.000Z" }
    ],
    now: "2026-07-13T16:06:00.000Z"
  });

  assert.equal(packet.rootCallId, "call-1");
  assert.equal(packet.continuationIndex, 1);
  assert.match(packet.summary, /first-touch logging/i);
  assert.match(packet.decisions[0].text, /visible fallback queue/i);
  assert.match(packet.openQuestions[0].text, /enrichment is unavailable/i);
  assert.match(packet.nextActions.at(-1).text, /acceptance criteria/i);
  assert.equal(packet.artifacts[0].id, "a1");
  assert.equal(packet.activeWork[0].status, "running");
  assert.equal(packet.recentTurns.length, 4);
});

test("resume packet carries prior thread state forward without growing without bound", () => {
  const priorPacket = {
    rootCallId: "call-1",
    summary: "The team agreed that speed and auditability are the governing product constraints.",
    decisions: [{ text: "Use a durable audit trail." }],
    openQuestions: [{ text: "Who owns failed enrichment?" }],
    nextActions: [{ text: "Draft the failure-state matrix." }]
  };
  const packet = buildSessionResumePacket({
    call: {
      id: "call-3",
      threadId: "call-1",
      continuationIndex: 2,
      title: "Failure-state workshop",
      transcript: Array.from({ length: 30 }, (_, index) => ({
        speaker: index % 2 ? "Cooper" : "Michael",
        text: index === 28 ? "We should assign the queue to sales operations." : `Discussion turn ${index} about fallback behavior.`,
        at: `2026-07-13T17:${String(index).padStart(2, "0")}:00.000Z`
      }))
    },
    priorPacket,
    limits: { recentTurns: 8, decisions: 4, summaryChars: 500 }
  });

  assert.match(packet.summary, /governing product constraints/i);
  assert.match(packet.summary, /Latest session/i);
  assert.equal(packet.recentTurns.length, 8);
  assert.ok(packet.decisions.length <= 4);
  assert.ok(packet.summary.length <= 500);
  assert.ok(packet.openQuestions.some((item) => /failed enrichment/i.test(item.text)));
});

test("formatted resume context is bounded and labels prior state as untrusted continuity context", () => {
  const packet = buildSessionResumePacket({
    call: {
      id: "call-9",
      title: "Architecture review",
      transcript: [{ speaker: "Michael", text: "We should keep the orchestration boundary explicit." }]
    }
  });
  const context = formatSessionResumeContext(packet, 900);

  assert.match(context, /Resumed Session Context/);
  assert.match(context, /persisted public session records/i);
  assert.match(context, /Do not claim that open items are complete/i);
  assert.ok(context.length <= 900);
});
