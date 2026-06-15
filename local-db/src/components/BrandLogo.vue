<script setup>
// PALMY / DATA tile logo used in image exports.
defineProps({
  tile: { type: String, default: '#1e293b' },
  letter: { type: String, default: 'white' },
  slash: { type: String, default: '#64748b' },
})
const ROW1 = ['P', 'A', 'L', 'M', 'Y']
const ROW2 = ['D', 'A', 'T', 'A', '/']
</script>

<template>
  <svg width="73" height="28" viewBox="0 0 73 28" xmlns="http://www.w3.org/2000/svg">
    <template v-for="(_, c) in 5" :key="c">
      <rect :x="c * 15" y="0" width="13" height="13" :fill="tile" rx="1.5" />
      <rect :x="c * 15" y="15" width="13" height="13" :fill="tile" rx="1.5" />
    </template>
    <text
      v-for="(ch, i) in ROW1"
      :key="`r1-${i}`"
      :x="i * 15 + 6.5"
      y="6.5"
      dominant-baseline="central"
      text-anchor="middle"
      font-family="'Arial Black', Arial, sans-serif"
      font-size="7.5"
      font-weight="900"
      :fill="letter"
    >{{ ch }}</text>
    <text
      v-for="(ch, i) in ROW2"
      :key="`r2-${i}`"
      :x="i * 15 + 6.5"
      y="21.5"
      dominant-baseline="central"
      text-anchor="middle"
      font-family="'Arial Black', Arial, sans-serif"
      font-size="7.5"
      font-weight="900"
      :fill="ch === '/' ? slash : letter"
    >{{ ch }}</text>
  </svg>
</template>
