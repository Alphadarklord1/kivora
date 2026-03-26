export function parseFlashcards(content: string): Array<{ front: string; back: string }> {
  const lines = content
    .split(/\n/)
    .map((line) => line.replace(/^\d+[.)]\s*/, '').trim())
    .filter(Boolean);

  // Format: **Front**: text | **Back**: text  (Groq bold markdown style)
  // Format: Front: text | Back: text          (plain style)
  const pipePattern = /\*{0,2}front\*{0,2}:\s*(.*?)\s*\|\s*\*{0,2}back\*{0,2}:\s*(.*)/i;
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
    const frontMatch = lines[i].match(/^\*{0,2}front\*{0,2}:\s*(.*)/i);
    const backMatch = lines[i + 1].match(/^\*{0,2}back\*{0,2}:\s*(.*)/i);
    if (frontMatch && backMatch) {
      twoLineCards.push({ front: frontMatch[1].trim(), back: backMatch[1].trim() });
      i++; // skip next line
    }
  }
  if (twoLineCards.length > 0) return twoLineCards.filter((card) => card.front);

  // Format: --- separator blocks with Front:/Back: labels
  return content
    .split(/---+/)
    .map((block) => ({
      front: block.match(/\*?\*?Front:\*?\*?\s*([\s\S]*?)(?=\*?\*?Back:|$)/i)?.[1]?.trim() ?? '',
      back: block.match(/\*?\*?Back:\*?\*?\s*([\s\S]*?)$/i)?.[1]?.trim() ?? '',
    }))
    .filter((card) => card.front);
}
