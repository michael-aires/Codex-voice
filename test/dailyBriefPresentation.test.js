import assert from "node:assert/strict";
import test from "node:test";
import { dailyBriefSlideIndexFromTranscript } from "../src/dailyBriefPresentation.js";

const slides = [
  { id: "overview", voiceCue: "Good morning. Here's your daily update." },
  { id: "calendar", voiceCue: "On your calendar" },
  { id: "sprint", voiceCue: "In the sprint" },
  { id: "focus", voiceCue: "Your focus for today" }
];

test("daily brief advances on spoken transition cues", () => {
  assert.equal(dailyBriefSlideIndexFromTranscript(slides, "Good morning. Here's your daily update."), 0);
  assert.equal(dailyBriefSlideIndexFromTranscript(slides, "Good morning. On your calendar: three meetings."), 1);
  assert.equal(dailyBriefSlideIndexFromTranscript(slides, "On your calendar. In the sprint: five tickets."), 2);
  assert.equal(dailyBriefSlideIndexFromTranscript(slides, "In the sprint. Your focus for today is the launch."), 3);
});

test("daily brief synchronization never moves backward", () => {
  assert.equal(dailyBriefSlideIndexFromTranscript(slides, "On your calendar", 2), 2);
});

test("daily brief uses stable fallback cues for previously saved slides", () => {
  const legacySlides = slides.map(({ id }) => ({ id }));
  assert.equal(dailyBriefSlideIndexFromTranscript(legacySlides, "Okay. In the sprint, there are two tickets."), 2);
});
