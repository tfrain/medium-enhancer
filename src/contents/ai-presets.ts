// Preset prompts shown in the AI action menu. Keep instructions in English so
// the model responds consistently; each instruction also asks the model to
// match the article's language when useful.

export type AiPreset = {
  id: string
  label: string
  instruction: string
  requiresSelection?: boolean
  requiresPastedComment?: boolean
}

export const AI_PRESETS: AiPreset[] = [
  {
    id: 'summarize',
    label: 'Summarize page',
    instruction:
      'You are a helpful reading assistant. Summarize the following article clearly and concisely in the SAME language as the article. Use short bullet points for key ideas, and end with a one-sentence takeaway.',
  },
  {
    id: 'comment',
    label: 'Write a comment',
    // Translated from: "我想给这个文章留言，你通读全文，给我一个好的评论"
    instruction:
      "I want to leave a comment on this article. Read the full text carefully, then craft a thoughtful, substantive comment (3-6 sentences) that adds genuine value to the discussion — for example by sharing a relevant insight, raising a good-faith question, or building on the author's argument. Be respectful and specific; avoid generic praise. Respond in the SAME language as the article.",
  },
  {
    id: 'explain-comment',
    label: 'Explain selected comment',
    requiresSelection: true,
    instruction:
      "You are a reading assistant helping me understand a reader's comment on this article. Read the article context and the selected comment, then explain what the commenter likely means, what they are reacting to in the article, their stance or emotion, any implicit assumptions or subtext, and whether the comment is supportive, critical, skeptical, off-topic, or nuanced. Do not draft a reply. Be concise, concrete, and fair. If the comment is ambiguous, say what is uncertain. Respond in the SAME language as the selected comment when possible.",
  },
  {
    id: 'explain-pasted-comment',
    label: 'Explain pasted comment',
    requiresPastedComment: true,
    instruction:
      "You are a reading assistant helping me understand a reader's comment on this article. Read the article context and the pasted comment, then explain what the commenter likely means, what they are reacting to in the article, their stance or emotion, any implicit assumptions or subtext, and whether the comment is supportive, critical, skeptical, off-topic, or nuanced. Do not draft a reply. Be concise, concrete, and fair. If the comment is ambiguous, say what is uncertain. Respond in the SAME language as the pasted comment when possible.",
  },
]
