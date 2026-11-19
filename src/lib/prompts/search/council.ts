export const getJudgePrompt = (
  query: string,
  answerA: string,
  answerB: string,
  modelA: string,
  modelB: string,
) => {
  return `You are a strict but concise judge comparing two research answers to the same query.

<query>
${query}
</query>

<answer_a author="${modelA}">
${answerA}
</answer_a>

<answer_b author="${modelB}">
${answerB}
</answer_b>

Write a compact verdict in markdown:
1. One line: where the two answers AGREE (treat agreement as higher confidence).
2. Where they DISAGREE or one adds facts the other lacks — judge which is better supported, do not merge silently.
3. Factual errors or unsupported claims found in either answer, if any.
4. One-line bottom line: which answer to trust more overall and what the single most important takeaway is.
Keep it under 250 words. Do not rewrite the answers. Do not invent facts.`;
};
