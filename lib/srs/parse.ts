export function parseFlashcards(content: string): Array<{ front: string; back: string }> {
  // The offline generator decorates each label with an emoji ("🟦 **Front:**",
  // "🟩 **Back:**"). Strip any leading non-letter/digit prefix on each line so
  // the same patterns match cloud-AI output ("Front:") and offline output.
  const lines = content
    .split(/\n/)
    .map((line) => line
      .replace(/^\d+[.)]\s*/, '')
      .replace(/^[^\p{L}\p{N}*]+/u, '')
      .trim())
    .filter(Boolean);

  // Format: **Front:** text | **Back:** text  (bold markdown style)
  // Format: Front: text | Back: text          (plain style)
  // The trailing \*{0,2} sits AFTER the colon to absorb the closing markdown
  // bold marker — the original pattern placed it before the colon, which left
  // a leading "** " in every captured value when the source was bolded.
  const pipePattern = /\*{0,2}front:\*{0,2}\s*(.*?)\s*\|\s*\*{0,2}back:\*{0,2}\s*(.*)/i;
  const pipeLines = lines.filter((line) => pipePattern.test(line));

  if (pipeLines.length > 0) {
    return pipeLines
      .map((line) => {
        const m = line.match(pipePattern);
        return {
          front: (m?.[1] ?? '').trim(),
          back: (m?.[2] ?? '').trim(),
        };
      })
      .filter((card) => card.front);
  }

  // Format: Front: text\nBack: text  (two-line style)
  const twoLineCards: Array<{ front: string; back: string }> = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const frontMatch = lines[i].match(/^\*{0,2}front:\*{0,2}\s*(.*)/i);
    const backMatch = lines[i + 1].match(/^\*{0,2}back:\*{0,2}\s*(.*)/i);
    if (frontMatch && backMatch) {
      twoLineCards.push({ front: frontMatch[1].trim(), back: backMatch[1].trim() });
      i++; // skip next line
    }
  }
  if (twoLineCards.length > 0) return twoLineCards.filter((card) => card.front);

  // Format: --- separator blocks with Front:/Back: labels. Reuse the cleaned
  // line stream so emoji prefixes don't leak into the captured front text.
  const cleaned = lines.join('\n');
  return cleaned
    .split(/---+/)
    .map((block) => ({
      front: block.match(/\*?\*?Front:\*?\*?\s*([\s\S]*?)(?=\s*\*?\*?Back:|$)/i)?.[1]?.trim() ?? '',
      back: block.match(/\*?\*?Back:\*?\*?\s*([\s\S]*?)$/i)?.[1]?.trim() ?? '',
    }))
    .filter((card) => card.front);
}
