export function useApi() {
  async function api(path, opts) {
    const r = await fetch(path, opts)
    const data = await r.json()
    return data
  }
  return { api }
}
