<!-- 顶部 Tab 导航，可横向滚动 -->
<script setup>
const props = defineProps({
  tabs: { type: Array, required: true },
  modelValue: { type: String, required: true }
})
const emit = defineEmits(['update:modelValue'])

function select(key) { emit('update:modelValue', key) }
</script>

<template>
  <nav class="tab-bar">
    <div class="brand-title">
      <span class="brand-zh">语伴</span>
      <span class="brand-en">English Interview Buddy</span>
    </div>
    <div class="tab-bar-inner">
      <div
        v-for="t in tabs"
        :key="t.key"
        class="tab-item"
        :class="{ active: t.key === modelValue }"
        @click="select(t.key)"
      >
        <span v-if="t.icon" class="tab-icon">{{ t.icon }}</span>
        <span class="tab-text">
          <span class="tab-zh">{{ t.label }}</span>
          <span class="tab-en">{{ t.en }}</span>
        </span>
      </div>
    </div>
  </nav>
</template>
