// Claude pricing per million tokens (USD). Shared by the header usage menu and the
// Ask page's per-request cost summary.
export const MODEL_PRICING = {
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'claude-haiku-4-5':          { input: 0.80, output: 4.00 },
  'claude-sonnet-4-6':         { input: 3.00, output: 15.00 },
  'claude-opus-4-8':           { input: 15.00, output: 75.00 },
}

export function pricing(model) {
  return MODEL_PRICING[model] ?? { input: 0.80, output: 4.00 }
}

// Cost in USD for a given input/output token count on a model.
export function tokenCost(model, inputTokens = 0, outputTokens = 0) {
  const p = pricing(model)
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000
}

export function fmtUsd(n) {
  if (n == null) return '—'
  if (n < 0.01) return '<$0.01'
  return `$${n.toFixed(2)}`
}
