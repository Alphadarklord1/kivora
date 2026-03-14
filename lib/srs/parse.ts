export function parseFlashcards(content: string): Array<{ front: string; back: string }> {
  const pipeLines = content
    .split(/\n/)
    .map((line) => line.replace(/^\d+[.)]\s*/, '').trim())
    .filter((line) => /front:/i.test(line) && /back:/i.test(line));

  if (pipeLines.length > 0) {
    return pipeLines
      .map((line) => ({
        front: (line.match(/front:\s*(.*?)(?:\s*\|\s*back:|$)/i)?.[1] ?? '').trim(),
        back: (line.match(/back:\s*(.*?)$/i)?.[1] ?? '').trim(),
      }))
      .filter((card) => card.front);
  }

  return content
    .split(/---+/)
    .map((block) => ({
      front: block.match(/\*?\*?Front:\*?\*?\s*([\s\S]*?)(?=\*?\*?Back:|$)/i)?.[1]?.trim() ?? '',
      back: block.match(/\*?\*?Back:\*?\*?\s*([\s\S]*?)$/i)?.[1]?.trim() ?? '',
    }))
    .filter((card) => card.front);
}
