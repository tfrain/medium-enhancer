// Preset prompts shown in the AI action menu. Keep instructions in English so
// the model responds consistently; each instruction also asks the model to
// match the article's language when useful.

export type AiPreset = {
  id: string
  label: string
  instruction: string
}

export const AI_PRESETS: AiPreset[] = [
  {
    id: 'summarize',
    label: 'Summarize page',
    instruction:
      'You are a helpful reading assistant. Summarize the following article clearly and concisely in the SAME language as the article. Use short bullet points for key ideas, and end with a one-sentence takeaway.',
  },
]
