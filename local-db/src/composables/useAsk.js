import { ref, shallowRef } from 'vue'
import { createClient } from 'graphql-ws'

// One lazily-created GraphQL-over-WebSocket client for the whole app session.
let _client = null
function client() {
  if (!_client) {
    const url = `${location.origin.replace(/^http/, 'ws')}/graphql`
    _client = createClient({ url, lazy: true })
  }
  return _client
}

const ASK_SUBSCRIPTION = /* GraphQL */ `
  subscription Ask($chatId: String!, $prompt: String!) {
    ask(chatId: $chatId, prompt: $prompt) {
      type
      message
      attempt
      maxAttempts
      inputTokens
      outputTokens
      rowCount
      executionMs
      columns
      rows
      model
      title
    }
  }
`

let _turnId = 0

// Persist chat sessions (bubbles + latest result, named by Claude's table label)
// so they survive a reload and can be reopened from the history list. The server
// keeps the matching conversation context durably (keyed by the same chatId), so
// reopening an old session and asking a follow-up still has memory.
const STORAGE_KEY = 'afl_ask_sessions'
const MAX_STORED_TURNS = 100
const MAX_SESSIONS = 30

export function useAsk() {
  const chatId = ref(crypto.randomUUID())
  const turns = ref([])               // current session: { id, prompt, events:[], tokens, result, running, done, failed }
  const result = shallowRef(null)     // latest successful result, shown in the main area
  const running = ref(false)
  const currentName = ref('')         // Claude's label for the last table this session
  const sessions = ref([])            // [{ chatId, name, turns, result, updatedAt }] most-recent first

  let dispose = null

  function defaultName() {
    const first = turns.value[0]?.prompt ?? ''
    return first.length > 40 ? `${first.slice(0, 40)}…` : (first || 'New chat')
  }

  // Snapshot the current session into `sessions` and write everything to storage.
  // Bubbles are saved unconditionally; results are best-effort (largest payload),
  // degrading to current-only then none so a quota error never drops the history.
  function persist() {
    if (turns.value.length) {
      const entry = {
        chatId: chatId.value,
        name: currentName.value || defaultName(),
        turns: turns.value.slice(-MAX_STORED_TURNS).map(({ result: _r, running: _g, ...rest }) => rest),
        result: result.value,
        updatedAt: Date.now(),
      }
      sessions.value = [entry, ...sessions.value.filter(s => s.chatId !== chatId.value)].slice(0, MAX_SESSIONS)
    }
    const variants = [
      () => sessions.value,
      () => sessions.value.map(s => (s.chatId === chatId.value ? s : { ...s, result: null })),
      () => sessions.value.map(s => ({ ...s, result: null })),
    ]
    for (const build of variants) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessions: build() }))
        return
      } catch { /* try a smaller variant */ }
    }
  }

  function hydrate(session) {
    chatId.value = session.chatId
    currentName.value = session.name || ''
    turns.value = (session.turns ?? []).map(t => ({ result: null, ...t, running: false }))
    result.value = session.result ?? null
    _turnId = turns.value.reduce((m, t) => Math.max(m, t.id || 0), _turnId)
  }

  // Load saved sessions and reopen the most recent one.
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (data && Array.isArray(data.sessions)) {
      sessions.value = data.sessions
      if (sessions.value[0]) hydrate(sessions.value[0])
    }
  } catch { /* corrupt entry — start fresh */ }

  function stop() {
    if (dispose) { dispose(); dispose = null }
    running.value = false
  }

  // Start a fresh session (a new server-side context). Prior sessions are kept in
  // history, so this is also "clear chat" — the new chat has no prior context.
  function newChat() {
    stop()
    chatId.value = crypto.randomUUID()
    currentName.value = ''
    turns.value = []
    result.value = null
  }

  function openSession(id) {
    if (id === chatId.value) return
    stop()
    const s = sessions.value.find(x => x.chatId === id)
    if (s) hydrate(s)
  }

  function deleteSession(id) {
    sessions.value = sessions.value.filter(s => s.chatId !== id)
    if (id === chatId.value) newChat()
    persist()
  }

  async function ask(prompt) {
    const text = prompt?.trim()
    if (!text || running.value) return
    stop()

    const turn = {
      id: ++_turnId,
      prompt: text,
      events: [],
      tokens: { input: 0, output: 0, model: null },
      result: null,
      running: true,
      done: false,
      failed: false,
    }
    turns.value.push(turn)
    running.value = true

    const iterator = client().iterate({
      query: ASK_SUBSCRIPTION,
      variables: { chatId: chatId.value, prompt: text },
    })
    dispose = () => iterator.return?.()

    try {
      for await (const msg of iterator) {
        const e = msg.data?.ask
        if (!e) continue

        switch (e.type) {
          case 'tokens':
            turn.tokens = { input: e.inputTokens ?? 0, output: e.outputTokens ?? 0, model: e.model ?? turn.tokens.model }
            break
          case 'result': {
            const r = {
              columns: e.columns ?? [],
              rows: e.rows ? JSON.parse(e.rows) : [],
              rowCount: e.rowCount ?? 0,
              executionMs: e.executionMs ?? 0,
            }
            turn.result = r
            result.value = r          // latest result drives the main-area table
            if (e.title) currentName.value = e.title   // name the session after the last table
            break
          }
          case 'done':
            if (e.model) turn.tokens = { ...turn.tokens, model: e.model }
            turn.events.push(e)
            turn.done = true
            break
          case 'failed':
            turn.events.push(e)
            turn.failed = true
            break
          default:
            // status | attempt | error
            turn.events.push(e)
        }
      }
    } catch (err) {
      turn.events.push({ type: 'failed', message: err?.message ?? 'Connection error' })
      turn.failed = true
    } finally {
      turn.running = false
      running.value = false
      dispose = null
      persist()
    }
  }

  return {
    chatId, turns, result, running, currentName, sessions,
    ask, newChat, openSession, deleteSession, stop,
  }
}
