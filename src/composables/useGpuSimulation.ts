// GPU-accelerated alternative to the CPU batch simulator in useSimulation.ts.
// Runs the exact same season-simulation model (strength-scaled random scores,
// points, percentage tie-break) as a WebGPU compute shader so a batch of
// seasons can be simulated in parallel on the GPU instead of one at a time on
// the main thread. Feature-detected and opt-in: callers must check `checkGpuSupport()`
// before offering it, and everything here falls back to `null`/no-ops if
// WebGPU isn't available so the CPU path (useSimulation.ts) remains the
// default, always-working implementation.
import type { AflMatch } from '../types/afl'
import type { PalmyVariant } from '../utils/palmyWinProb'
import { TEAM_IDS, matchHomeWinProb, accumulateSimResult, accumulateFinalsResult, type RangeAccumulator, type MatchScorePrediction } from './useSimulation'
import { resolveFinalsForOrder } from './useFinals'
import { LEAGUE_CONFIG } from '../config/league'
// TEAMS (not TEAM_IDS from useSimulation.ts) specifically to avoid this
// module's existing circular import with useSimulation.ts: useSimulation.ts
// imports from here at its own module top level, so a value read from
// useSimulation.ts used at OUR top level (to size MAX_TEAMS below) could see
// an uninitialised binding depending on which module starts evaluating
// first. useAFLData.ts isn't part of that cycle, so it's safe here.
import { TEAMS } from './useAFLData'

const MAX_TEAMS = TEAMS.length
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

// Random-score model constants — interpolated from LEAGUE_CONFIG.sim (the
// exact same source useSimulation.ts's MARGIN_SIGMA/MID_SIGMA/AVG_AFL_SCORE
// read from), so the two can no longer drift out of sync the way hardcoded
// mirrored literals could. See sampleMatchScores in useSimulation.ts for the
// model: home margin ~ N(MARGIN_SIGMA * invNorm(p), MARGIN_SIGMA), scores
// split around a shared N(AVG_AFL_SCORE, MID_SIGMA) midpoint.
const AVG_AFL_SCORE: f32 = ${LEAGUE_CONFIG.sim.avgScore.toFixed(1)};
const MARGIN_SIGMA: f32 = ${LEAGUE_CONFIG.sim.marginSigma.toFixed(1)};
const MID_SIGMA: f32 = ${LEAGUE_CONFIG.sim.midSigma.toFixed(1)};
// Must match DRAW_PROB in useSimulation.ts: same single-roll model (r below
// DRAW_PROB draws, otherwise r rescaled to [0,1) decides the winner).
const DRAW_PROB: f32 = 0.009;
// winnerOfMatch sentinel for a drawn game; matches no team index.
const NO_WINNER: u32 = 0xffffffffu;
const MAX_TEAMS: u32 = ${MAX_TEAMS}u;

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

// Inverse standard normal CDF, Acklam's approximation — mirror of invNorm()
// in utils/normal.ts (keep coefficients in sync). Input clamped away from 0/1.
fn inv_norm(p_in: f32) -> f32 {
  let p = clamp(p_in, 1e-6, 1.0 - 1e-6);
  if (p < 0.02425) {
    let q = sqrt(-2.0 * log(p));
    return (((((-7.784894002430293e-03 * q - 3.223964580411365e-01) * q - 2.400758277161838) * q - 2.549732539343734) * q + 4.374664141464968) * q + 2.938163982698783) /
      ((((7.784695709041462e-03 * q + 3.224671290700398e-01) * q + 2.445134137142996) * q + 3.754408661907416) * q + 1.0);
  }
  if (p > 1.0 - 0.02425) {
    let q = sqrt(-2.0 * log(1.0 - p));
    return -(((((-7.784894002430293e-03 * q - 3.223964580411365e-01) * q - 2.400758277161838) * q - 2.549732539343734) * q + 4.374664141464968) * q + 2.938163982698783) /
      ((((7.784695709041462e-03 * q + 3.224671290700398e-01) * q + 2.445134137142996) * q + 3.754408661907416) * q + 1.0);
  }
  let q = p - 0.5;
  let r = q * q;
  return (((((-3.969683028665376e+01 * r + 2.209460984245205e+02) * r - 2.759285104469687e+02) * r + 1.383577518672690e+02) * r - 3.066479806614716e+01) * r + 2.506628277459239) * q /
    (((((-5.447609879822406e+01 * r + 1.615858368580409e+02) * r - 1.556989798598866e+02) * r + 6.680131188771972e+01) * r - 1.328068155288572e+01) * r + 1.0);
}

var<private> pts: array<f32, ${MAX_TEAMS}>;
var<private> forf: array<f32, ${MAX_TEAMS}>;
var<private> against: array<f32, ${MAX_TEAMS}>;
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
    // Shared per-game scoring midpoint; second uniform salted past the winner
    // rolls (indices [0, m)) so the streams never collide.
    let mid = AVG_AFL_SCORE + MID_SIGMA * inv_norm(rand01(i, k + m));
    if (r < DRAW_PROB) {
      winnerOfMatch[k] = NO_WINNER;
      let drawScore = max(0.0, round(mid));
      pts[h] = pts[h] + 2.0;
      pts[a] = pts[a] + 2.0;
      forf[h] = forf[h] + drawScore;
      against[h] = against[h] + drawScore;
      forf[a] = forf[a] + drawScore;
      against[a] = against[a] + drawScore;
      continue;
    }
    let u = (r - DRAW_PROB) / (1.0 - DRAW_PROB);
    let p = matchHomeProb[k];
    let homeWins = u < p;
    var winner: u32;
    var loser: u32;
    if (homeWins) { winner = h; loser = a; } else { winner = a; loser = h; }
    winnerOfMatch[k] = winner;
    // Same margin construction as sampleMatchScores(): reuse the winner roll u
    // so the margin's sign agrees with the decided winner by construction.
    let homeMargin = MARGIN_SIGMA * (inv_norm(p) + inv_norm(1.0 - u));
    let absMargin = max(1.0, round(abs(homeMargin)));
    let loserScore = max(0.0, round(mid - absMargin / 2.0));
    let winnerScore = loserScore + absMargin;
    pts[winner] = pts[winner] + 4.0;
    forf[winner] = forf[winner] + winnerScore;
    against[winner] = against[winner] + loserScore;
    forf[loser] = forf[loser] + loserScore;
    against[loser] = against[loser] + winnerScore;
  }

  var order: array<u32, ${MAX_TEAMS}>;
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
  // Stashed so runGpuRangeBatch can resolve finals per sim without threading
  // extra parameters through runManyGpu()'s call chain.
  rankMap: Record<number, number>
  predMap: Map<number, MatchScorePrediction> | null
  usePalmy: boolean
  variant: PalmyVariant
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

  return { device, pipeline, paramsBuf, numTeams: n, numMatches, teamIds, teamIndex, orderOutBuf, nextWinMaskOutBuf, readOrderBuf, readMaskBuf, bindGroup, maxBatch, rankMap, predMap, usePalmy, variant }
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

  const hasFinals = acc.finalsTemplate.matches.length > 0
  const order: number[] = new Array(numTeams)
  for (let s = 0; s < batchSize; s++) {
    const base = s * MAX_TEAMS
    for (let t = 0; t < numTeams; t++) order[t] = teamIds[orders[base + t]]
    const mask = masks[s]
    accumulateSimResult(acc, order, (tid) => {
      const idx = teamIndex.get(tid)
      return idx !== undefined && (mask & (1 << idx)) !== 0
    })
    if (hasFinals) {
      accumulateFinalsResult(acc, resolveFinalsForOrder(acc.finalsTemplate, order, ctx.rankMap, ctx.predMap, ctx.usePalmy, ctx.variant))
    }
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
