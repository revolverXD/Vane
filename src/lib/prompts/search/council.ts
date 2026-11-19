export const getJudgePrompt = (
  query: string,
  answers: { author: string; text: string }[],
) => {
  const blocks = answers
    .map(
      (a, i) =>
        `<answer id="${String.fromCharCode(97 + i)}" author="${a.author}">\n${a.text}\n</answer>`,
    )
    .join('\n\n');

  return `You are a strict but concise judge comparing ${answers.length} research answers to the same query.

<query>
${query}
</query>

${blocks}

Write a compact verdict in markdown:
1. One line: where the answers AGREE (agreement across models means higher confidence — say which ids agree).
2. Where they DISAGREE or one adds facts the others lack — judge which is better supported, do not merge silently.
3. Factual errors or unsupported claims found in any answer, if any.
4. One-line bottom line: which answer to trust most and the single most important takeaway.
Keep it under 250 words. Do not rewrite the answers. Do not invent facts.`;
};
