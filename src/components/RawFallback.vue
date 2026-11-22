<!-- 解析失败时：折叠展示原始返回 + 重试/复制按钮 -->
<script setup>
import { ref } from 'vue'
const props = defineProps({ raw: { type: String, required: true } })
const emit = defineEmits(['retry'])
const expanded = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(props.raw)
    alert('已复制到剪贴板')
  } catch { alert('复制失败，请手动复制') }
}
</script>

<template>
  <div class="card" style="border-color: var(--warn); background: var(--warn-soft)">
    <div style="display: flex; justify-content: space-between; align-items: center">
      <b>AI 返回解析失败</b>
      <button class="btn-link" @click="expanded = !expanded">{{ expanded ? '收起' : '展开原始返回' }}<span class="btn-en">{{ expanded ? 'Collapse' : 'Expand' }}</span></button>
    </div>
    <pre v-if="expanded" style="white-space: pre-wrap; font-size: 12px; max-height: 300px; overflow: auto; background: var(--bg-elevated); padding: 10px; border-radius: 12px; border: 1px solid var(--border)">{{ raw }}</pre>
    <div style="display: flex; gap: 10px; margin-top: 10px">
      <button class="btn btn-ghost" @click="copy">📋 复制原文<span class="btn-en">Copy</span></button>
      <button class="btn btn-primary" @click="emit('retry')">🔄 重试<span class="btn-en">Retry</span></button>
    </div>
  </div>
</template>
