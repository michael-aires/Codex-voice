const fallbackCues = {
  calendar: ["on your calendar"],
  sprint: ["in the sprint"],
  focus: ["your focus for today"]
};

export function dailyBriefSlideIndexFromTranscript(slides = [], transcript = "", currentIndex = 0) {
  if (!slides.length) return 0;

  const lastIndex = slides.length - 1;
  const normalizedTranscript = normalizeSpeech(transcript);
  let matchedIndex = Math.min(lastIndex, Math.max(0, Number(currentIndex) || 0));

  slides.forEach((slide, index) => {
    if (index <= matchedIndex) return;
    const cues = [slide?.voiceCue, ...(fallbackCues[slide?.id] || [])]
      .map(normalizeSpeech)
      .filter(Boolean);
    if (cues.some((cue) => normalizedTranscript.includes(cue))) matchedIndex = index;
  });

  return matchedIndex;
}

function normalizeSpeech(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
