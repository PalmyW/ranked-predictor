<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  sections:   { type: Array,  required: true },
  modelValue: { type: Object, default: () => ({}) },
  prefix:     { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'change'])

const open = ref(false)

function isGroupAll(sec) {
  return sec.cols.every(c => props.modelValue[c.key] !== false)
}

function isGroupNone(sec) {
  return sec.cols.every(c => props.modelValue[c.key] === false)
}

function isIndeterminate(sec) {
  return !isGroupAll(sec) && !isGroupNone(sec)
}

function toggleKey(key, val) {
  const next = { ...props.modelValue, [key]: val }
  emit('update:modelValue', next)
  emit('change', { key, visible: val, prefix: props.prefix })
}

function toggleGroup(sec, val) {
  const next = { ...props.modelValue }
  for (const c of sec.cols) next[c.key] = val
  emit('update:modelValue', next)
  for (const c of sec.cols) emit('change', { key: c.key, visible: val, prefix: props.prefix })
}
</script>

<template>
  <v-menu v-model="open" :close-on-content-click="false" location="bottom end">
    <template #activator="{ props: menuProps }">
      <v-btn v-bind="menuProps" variant="tonal" size="small" prepend-icon="mdi-eye-outline">
        Columns
      </v-btn>
    </template>

    <v-card min-width="200" max-height="440" style="overflow-y:auto">
      <v-list density="compact" lines="one">
        <template v-for="sec in sections" :key="sec.title ?? 'flat'">
          <!-- Flat section: no group header -->
          <template v-if="sec.flat">
            <v-list-item v-for="col in sec.cols" :key="col.key">
              <template #prepend>
                <v-checkbox-btn
                  :model-value="modelValue[col.key] !== false"
                  density="compact"
                  @update:model-value="val => toggleKey(col.key, val)"
                />
              </template>
              <v-list-item-title class="text-body-2">{{ col.label }}</v-list-item-title>
            </v-list-item>
          </template>

          <!-- Grouped section with master checkbox -->
          <template v-else>
            <v-list-subheader class="d-flex align-center gap-1 pl-1">
              <v-checkbox-btn
                :model-value="isGroupAll(sec)"
                :indeterminate="isIndeterminate(sec)"
                density="compact"
                @update:model-value="val => toggleGroup(sec, val)"
              />
              <span class="text-caption font-weight-bold text-uppercase">{{ sec.title }}</span>
            </v-list-subheader>
            <v-list-item v-for="col in sec.cols" :key="col.key" class="pl-6">
              <template #prepend>
                <v-checkbox-btn
                  :model-value="modelValue[col.key] !== false"
                  density="compact"
                  @update:model-value="val => toggleKey(col.key, val)"
                />
              </template>
              <v-list-item-title class="text-body-2">{{ col.label }}</v-list-item-title>
            </v-list-item>
          </template>
        </template>
      </v-list>
    </v-card>
  </v-menu>
</template>
