<!--
  题型平均分柱状图 —— 纯 SVG
  输入：items: [{ label, score }]
-->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  items: { type: Array, required: true },
  height: { type: Number, default: 220 }
})

const width = 520
const padding = { l: 40, r: 16, t: 16, b: 48 }

const contentW = computed(() => width - padding.l - padding.r)
const contentH = computed(() => props.height - padding.t - padding.b)
const maxScore = computed(() => Math.max(10, ...props.items.map(i => i.score || 0)))

const colorOf = (s) => {
  if (s < 3) return 'var(--danger)'
  if (s < 5) return '#d9a3ac'
  if (s < 7) return '#8fb89c'
  return 'var(--ok)'
}
</script>

<template>
  <svg :width="width" :height="height" viewBox="0 0 {{ width }} {{ height }}" class="chart-wrap" style="max-width: 100%; height: auto">
    <!-- 网格 -->
    <g stroke="var(--border)" stroke-width="1" stroke-dasharray="2 3">
      <line v-for="i in 5" :key="i"
        :x1="padding.l" :x2="width - padding.r"
        :y1="padding.t + (contentH * i) / 5"
        :y2="padding.t + (contentH * i) / 5"
      />
    </g>
    <!-- Y 轴刻度 -->
    <g fill="var(--text-faint)" font-size="10">
      <text :x="padding.l - 6" :y="padding.t + contentH" text-anchor="end">0</text>
      <text :x="padding.l - 6" :y="padding.t + contentH / 2" text-anchor="end">{{ (maxScore / 2).toFixed(0) }}</text>
      <text :x="padding.l - 6" :y="padding.t + 12" text-anchor="end">{{ maxScore.toFixed(0) }}</text>
    </g>
    <!-- 柱子 -->
    <g v-for="(it, i) in items" :key="it.label">
      <rect
        :x="padding.l + (i + 0.2) * (contentW / items.length)"
        :y="padding.t + contentH - (it.score / maxScore) * contentH"
        :width="contentW / items.length * 0.6"
        :height="(it.score / maxScore) * contentH"
        :fill="colorOf(it.score)"
        fill-opacity=".82"
        rx="8"
      />
      <!-- 柱顶分数 -->
      <text
        :x="padding.l + (i + 0.5) * (contentW / items.length)"
        :y="padding.t + contentH - (it.score / maxScore) * contentH - 4"
        text-anchor="middle" font-size="11" fill="var(--text-soft)"
      >{{ it.score.toFixed(1) }}</text>
      <!-- 底部标签 -->
      <text
        :x="padding.l + (i + 0.5) * (contentW / items.length)"
        :y="height - padding.b + 14"
        text-anchor="middle" font-size="11" fill="var(--text-soft)"
      >{{ it.label }}</text>
    </g>
  </svg>
</template>
