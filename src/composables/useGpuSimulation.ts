// GPU-accelerated alternative to the CPU batch simulator in useSimulation.ts.
// Runs the exact same season-simulation model (fixed win/loss scores, points,
// percentage tie-break) as a WebGPU compute shader so a batch of seasons can
// be simulated in parallel on the GPU instead of one at a time on the main
// thread. Feature-detected and opt-in: callers must check `checkGpuSupport()`
// before offering it, and everything here falls back to `null`/no-ops if
// WebGPU isn't available so the CPU path (useSimulation.ts) remains the
// default, always-working implementation.
import type { AflMatch } from '../types/afl'
import type { PalmyVariant } from '../utils/palmyWinProb'
import { TEAM_IDS, matchHomeWinProb, accumulateSimResult, type RangeAccumulator, type MatchScorePrediction } from './useSimulation'

const MAX_TEAMS = 18
// Generous ceiling on remaining matches the shader's fixed-size per-invocation
// array can track (a full 18-team season is ~207 matches). Runs beyond this
// fall back to the CPU path rather than risk silent out-of-bounds behaviour,
// since WGSL clamps out-of-range array access instead of erroring.
const MAX_TRACKED_MATCHES = 220
// Per-batch dispatch cap: keeps a single GPU dispatch + readback bounded (well
// under the ~1GB storage buffer limit typical adapters report) while still
// letting one dispatch cover far more simulations than a CPU batch would.
const MAX_GPU_BATCH = 500000

const SHADER_SOURCE = `
struct Params {
  seed: u32,
  numMatches: u32,
  numTeams: u32,
  batchSize: u32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> basePts: array<f32>;
@group(0) @binding(2) var<storage, read> baseFor: array<f32>;
@group(0) @binding(3) var<storage, read> baseAgainst: array<f32>;
@group(0) @binding(4) var<storage, read> matchHomeIdx: array<u32>;
@group(0) @binding(5) var<storage, read> matchAwayIdx: array<u32>;
@group(0) @binding(6) var<storage, read> matchHomeProb: array<f32>;
@group(0) @binding(7) var<storage, read> nextMatchIdxForTeam: array<i32>;
@group(0) @binding(8) var<storage, read_write> orderOut: array<u32>;
@group(0) @binding(9) var<storage, read_write> nextWinMaskOut: array<u32>;

const SIM_WIN_SCORE: f32 = 101.0;
const SIM_LOSS_SCORE: f32 = 69.0;
const SIM_DRAW_SCORE: f32 = 85.0;
// Must match DRAW_PROB in useSimulation.ts: same single-roll model (r below
// DRAW_PROB draws, otherwise r rescaled to [0,1) decides the winner).
const DRAW_PROB: f32 = 0.009;
// winnerOfMatch sentinel for a drawn game; matches no team index.
const NO_WINNER: u32 = 0xffffffffu;
const MAX_TEAMS: u32 = 18u;

fn hash_u32(x: u32) -> u32 {
  var v = x;
  v = v ^ (v >> 16u);
  v = v * 0x7feb352du;
  v = v ^ (v >> 15u);
  v = v * 0x846ca68bu;
  v = v ^ (v >> 16u);
  return v;
}

fn rand01(invocation: u32, idx: u32) -> f32 {
  let h = hash_u32(hash_u32(params.seed ^ invocation) ^ (idx * 0x9e3779b9u));
  return f32(h) * (1.0 / 4294967296.0);
}

var<private> pts: array<f32, 18>;
var<private> forf: array<f32, 18>;
var<private> against: array<f32, 18>;
var<private> winnerOfMatch: array<u32, ${MAX_TRACKED_MATCHES}>;

fn pct_of(t: u32) -> f32 {
  if (against[t] > 0.0) { return forf[t] / against[t]; }
  if (forf[t] > 0.0) { return 999.0; }
  return 1.0;
}

fn better(a: u32, b: u32) -> bool {
  if (pts[a] != pts[b]) { return pts[a] > pts[b]; }
  return pct_of(a) > pct_of(b);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.batchSize) { return; }

  let n = params.numTeams;
  for (var t: u32 = 0u; t < n; t = t + 1u) {
    pts[t] = basePts[t];
    forf[t] = baseFor[t];
    against[t] = baseAgainst[t];
  }

  let m = params.numMatches;
  for (var k: u32 = 0u; k < m; k = k + 1u) {
    let r = rand01(i, k);
    let h = matchHomeIdx[k];
    let a = matchAwayIdx[k];
    if (r < DRAW_PROB) {
      winnerOfMatch[k] = NO_WINNER;
      pts[h] = pts[h] + 2.0;
      pts[a] = pts[a] + 2.0;
      forf[h] = forf[h] + SIM_DRAW_SCORE;
      against[h] = against[h] + SIM_DRAW_SCORE;
      forf[a] = forf[a] + SIM_DRAW_SCORE;
      against[a] = against[a] + SIM_DRAW_SCORE;
      continue;
    }
    let homeWins = (r - DRAW_PROB) / (1.0 - DRAW_PROB) < matchHomeProb[k];
    var winner: u32;
    var loser: u32;
    if (homeWins) { winner = h; loser = a; } else { winner = a; loser = h; }
    winnerOfMatch[k] = winner;
    pts[winner] = pts[winner] + 4.0;
    forf[winner] = forf[winner] + SIM_WIN_SCORE;
    against[winner] = against[winner] + SIM_LOSS_SCORE;
    forf[loser] = forf[loser] + SIM_LOSS_SCORE;
    against[loser] = against[loser] + SIM_WIN_SCORE;
  }

  var order: array<u32, 18>;
  for (var t: u32 = 0u; t < n; t = t + 1u) { order[t] = t; }

  for (var ii: u32 = 1u; ii < n; ii = ii + 1u) {
    let cur = order[ii];
    var jj: i32 = i32(ii) - 1;
    loop {
      if (jj < 0) { break; }
      if (!better(cur, order[u32(jj)])) { break; }
      order[u32(jj) + 1u] = order[u32(jj)];
      jj = jj - 1;
    }
    order[u32(jj) + 1] = cur;
  }

  let outBase = i * MAX_TEAMS;
  for (var t: u32 = 0u; t < n; t = t + 1u) {
    orderOut[outBase + t] = order[t];
  }

  var wonMask: u32 = 0u;
  for (var t: u32 = 0u; t < n; t = t + 1u) {
    let nm = nextMatchIdxForTeam[t];
    if (nm >= 0) {
      if (winnerOfMatch[u32(nm)] == t) {
        wonMask = wonMask | (1u << t);
      }
    }
  }
  nextWinMaskOut[i] = wonMask;
}
`

interface GpuHandle {
  device: GPUDevice
}

let cachedGpu: Promise<GpuHandle | null> | null = null

async function getGpuHandle(): Promise<GpuHandle | null> {
  if (!cachedGpu) {
    cachedGpu = (async () => {
      if (!('gpu' in navigator)) return null
      try {
        const gpu = (navigator as Navigator & { gpu: GPU }).gpu
        const adapter = await gpu.requestAdapter()
        if (!adapter) return null
        // The kernel binds 10 storage buffers; most adapters support well
        // beyond this, but bail out to the CPU path rather than restructure
        // bindings for the rare adapter that can't grant it.
        if ((adapter.limits.maxStorageBuffersPerShaderStage ?? 8) < 10) return null
        const device = await adapter.requestDevice({ requiredLimits: { maxStorageBuffersPerShaderStage: 10 } })
        return { device }
      } catch {
        return null
      }
    })()
  }
  return cachedGpu
}

// Cheap, cached feature check for UI gating (e.g. only show a "use GPU"
// checkbox when this resolves true).
export function checkGpuSupport(): Promise<boolean> {
  return getGpuHandle().then((h) => h !== null)
}

export interface GpuSimContext {
  device: GPUDevice
  pipeline: GPUComputePipeline
  paramsBuf: GPUBuffer
  numTeams: number
  numMatches: number
  teamIds: number[]
  teamIndex: Map<number, number>
  orderOutBuf: GPUBuffer
  nextWinMaskOutBuf: GPUBuffer
  readOrderBuf: GPUBuffer
  readMaskBuf: GPUBuffer
  bindGroup: GPUBindGroup
  maxBatch: number
}

function makeStorageBuffer(device: GPUDevice, data: Float32Array | Uint32Array | Int32Array): GPUBuffer {
  const buf = device.createBuffer({ size: Math.max(data.byteLength, 4), usage: GPUBufferUsage.STORAGE, mappedAtCreation: true })
  const range = buf.getMappedRange()
  if (data instanceof Float32Array) new Float32Array(range).set(data)
  else new Int32Array(range).set(data as Int32Array | Uint32Array)
  buf.unmap()
  return buf
}

// Builds the one-time GPU state for a run: uploads base stats and per-match
// win probabilities (computed via the same matchHomeWinProb used by the CPU
// path, so the two engines only ever differ in their RNG stream) and compiles
// the compute pipeline. Returns null if unsupported or the fixture has more
// remaining matches than the shader can track.
export async function createGpuSimContext(
  acc: RangeAccumulator,
  rankMap: Record<number, number>,
  predMap: Map<number, MatchScorePrediction> | null,
  usePalmy: boolean,
  variant: PalmyVariant,
): Promise<GpuSimContext | null> {
  const handle = await getGpuHandle()
  if (!handle) return null
  const { device } = handle

  const matches: readonly AflMatch[] = acc.activeMatches
  const numMatches = matches.length
  if (numMatches > MAX_TRACKED_MATCHES) return null

  const teamIds = TEAM_IDS
  const n = teamIds.length
  const teamIndex = new Map(teamIds.map((id, i) => [id, i]))

  const basePts = new Float32Array(n)
  const baseFor = new Float32Array(n)
  const baseAgainst = new Float32Array(n)
  teamIds.forEach((id, i) => {
    const s = acc.baseStats[id]
    basePts[i] = s.pts
    baseFor[i] = s.for
    baseAgainst[i] = s.against
  })

  const matchHomeIdx = new Uint32Array(numMatches)
  const matchAwayIdx = new Uint32Array(numMatches)
  const matchProb = new Float32Array(numMatches)
  const matchIdToIdx = new Map<number, number>()
  matches.forEach((m, i) => {
    matchHomeIdx[i] = teamIndex.get(m.homeTeamId) ?? 0
    matchAwayIdx[i] = teamIndex.get(m.awayTeamId) ?? 0
    matchProb[i] = matchHomeWinProb(m, rankMap, predMap, usePalmy, variant)
    matchIdToIdx.set(m.id, i)
  })

  const nextMatchIdxForTeam = new Int32Array(n).fill(-1)
  teamIds.forEach((id, i) => {
    const mId = acc.nextMatchId[id]
    if (mId !== undefined) {
      const idx = matchIdToIdx.get(mId)
      if (idx !== undefined) nextMatchIdxForTeam[i] = idx
    }
  })

  const module = device.createShaderModule({ code: SHADER_SOURCE })
  const info = await module.getCompilationInfo()
  if (info.messages.some((m) => m.type === 'error')) return null
  const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } })

  const paramsBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  const basePtsBuf = makeStorageBuffer(device, basePts)
  const baseForBuf = makeStorageBuffer(device, baseFor)
  const baseAgainstBuf = makeStorageBuffer(device, baseAgainst)
  const matchHomeIdxBuf = makeStorageBuffer(device, matchHomeIdx)
  const matchAwayIdxBuf = makeStorageBuffer(device, matchAwayIdx)
  const matchProbBuf = makeStorageBuffer(device, matchProb)
  const nextMatchIdxBuf = makeStorageBuffer(device, nextMatchIdxForTeam)

  const maxBatch = MAX_GPU_BATCH
  const orderOutBuf = device.createBuffer({ size: maxBatch * MAX_TEAMS * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC })
  const nextWinMaskOutBuf = device.createBuffer({ size: maxBatch * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC })
  const readOrderBuf = device.createBuffer({ size: maxBatch * MAX_TEAMS * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
  const readMaskBuf = device.createBuffer({ size: maxBatch * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: paramsBuf } },
      { binding: 1, resource: { buffer: basePtsBuf } },
      { binding: 2, resource: { buffer: baseForBuf } },
      { binding: 3, resource: { buffer: baseAgainstBuf } },
      { binding: 4, resource: { buffer: matchHomeIdxBuf } },
      { binding: 5, resource: { buffer: matchAwayIdxBuf } },
      { binding: 6, resource: { buffer: matchProbBuf } },
      { binding: 7, resource: { buffer: nextMatchIdxBuf } },
      { binding: 8, resource: { buffer: orderOutBuf } },
      { binding: 9, resource: { buffer: nextWinMaskOutBuf } },
    ],
  })

  return { device, pipeline, paramsBuf, numTeams: n, numMatches, teamIds, teamIndex, orderOutBuf, nextWinMaskOutBuf, readOrderBuf, readMaskBuf, bindGroup, maxBatch }
}

export function gpuMaxBatch(ctx: GpuSimContext): number {
  return ctx.maxBatch
}

let seedCounter = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0

// Dispatches one GPU batch and folds its results into `acc` via the same
// accumulateSimResult() the CPU path uses, so downstream aggregation
// (position counts, ladder dedup, next-game win tracking) is identical
// regardless of which engine produced the raw orderings.
export async function runGpuRangeBatch(ctx: GpuSimContext, acc: RangeAccumulator, batchSize: number): Promise<void> {
  const { device, pipeline, paramsBuf, numTeams, numMatches, teamIds, teamIndex, orderOutBuf, nextWinMaskOutBuf, readOrderBuf, readMaskBuf, bindGroup } = ctx
  seedCounter = (seedCounter + 0x9e3779b9) >>> 0
  device.queue.writeBuffer(paramsBuf, 0, new Uint32Array([seedCounter, numMatches, numTeams, batchSize]))

  const orderBytes = batchSize * MAX_TEAMS * 4
  const maskBytes = batchSize * 4

  const encoder = device.createCommandEncoder()
  const pass = encoder.beginComputePass()
  pass.setPipeline(pipeline)
  pass.setBindGroup(0, bindGroup)
  pass.dispatchWorkgroups(Math.ceil(batchSize / 64))
  pass.end()
  encoder.copyBufferToBuffer(orderOutBuf, 0, readOrderBuf, 0, orderBytes)
  encoder.copyBufferToBuffer(nextWinMaskOutBuf, 0, readMaskBuf, 0, maskBytes)
  device.queue.submit([encoder.finish()])

  await readOrderBuf.mapAsync(GPUMapMode.READ, 0, orderBytes)
  await readMaskBuf.mapAsync(GPUMapMode.READ, 0, maskBytes)
  const orders = new Uint32Array(readOrderBuf.getMappedRange(0, orderBytes).slice(0))
  const masks = new Uint32Array(readMaskBuf.getMappedRange(0, maskBytes).slice(0))
  readOrderBuf.unmap()
  readMaskBuf.unmap()

  const order: number[] = new Array(numTeams)
  for (let s = 0; s < batchSize; s++) {
    const base = s * MAX_TEAMS
    for (let t = 0; t < numTeams; t++) order[t] = teamIds[orders[base + t]]
    const mask = masks[s]
    accumulateSimResult(acc, order, (tid) => {
      const idx = teamIndex.get(tid)
      return idx !== undefined && (mask & (1 << idx)) !== 0
    })
  }
  acc.ran += batchSize
}

export function destroyGpuSimContext(ctx: GpuSimContext): void {
  ctx.orderOutBuf.destroy()
  ctx.nextWinMaskOutBuf.destroy()
  ctx.readOrderBuf.destroy()
  ctx.readMaskBuf.destroy()
  ctx.paramsBuf.destroy()
}
