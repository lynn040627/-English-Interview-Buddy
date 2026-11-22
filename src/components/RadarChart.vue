<!--
  六维雷达图 —— 纯 SVG 手写，自适应缩放
  视觉：淡水彩手绘（柔和虚线网架 + 渐变晕染填充 + 软光晕顶点）
  输入与评分逻辑保持不变：scores: { business, fluency, logic, vocabulary, pronunciation, grammar }
-->
<script setup>
import { computed } from 'vue'
import { DIMENSIONS } from '../store/state.js'

const props = defineProps({
  scores: { type: Object, required: true },
  size: { type: Number, default: 260 }
})

const cx = computed(() => props.size / 2)
const cy = computed(() => props.size / 2)
const radius = computed(() => props.size / 2 - 44)
const n = computed(() => DIMENSIONS.length)

// 每个维度的顶点坐标
const points = computed(() => {
  return DIMENSIONS.map((d, i) => {
    const angle = (Math.PI * 2 * i) / n.value - Math.PI / 2
    const v = Math.max(0, Math.min(10, Number(props.scores?.[d.key]) || 0))
    const r = (v / 10) * radius.value
    return {
      key: d.key, label: d.label,
      angle, v,
      x: cx.value + Math.cos(angle) * r,
      y: cy.value + Math.sin(angle) * r,
      lx: cx.value + Math.cos(angle) * (radius.value + 22),
      ly: cy.value + Math.sin(angle) * (radius.value + 22)
    }
  })
})

const polygon = computed(() => points.value.map(p => `${p.x},${p.y}`).join(' '))

// 网格线（4 层）
const rings = computed(() => {
  const arr = []
  for (let i = 1; i <= 4; i++) {
    const r = (radius.value * i) / 4
    const pts = []
    for (let j = 0; j < n.value; j++) {
      const a = (Math.PI * 2 * j) / n.value - Math.PI / 2
      pts.push(`${cx.value + Math.cos(a) * r},${cy.value + Math.sin(a) * r}`)
    }
    arr.push(pts.join(' '))
  }
  return arr
})

const labelColors = computed(() => {
  // 0-3 红、3-5 粉、6-7 浅绿、8-10 绿
  return points.value.map(p => {
    if (p.v < 3) return 'var(--danger)'
    if (p.v < 5) return '#d9a3ac'
    if (p.v < 7) return '#8fb89c'
    return 'var(--ok)'
  })
})
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 {{ size }} {{ size }}" class="chart-wrap">
    <defs>
      <!-- 淡水彩晕染填充 -->
      <radialGradient id="radarWash" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#d3e8da" stop-opacity=".6" />
        <stop offset="62%" stop-color="#e2d9ef" stop-opacity=".32" />
        <stop offset="100%" stop-color="#f5dcc6" stop-opacity=".22" />
      </radialGradient>
      <!-- 柔和描边渐变 -->
      <linearGradient id="radarStroke" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#b9d7c6" />
        <stop offset="60%" stop-color="#9cc7ae" />
        <stop offset="100%" stop-color="#6e9a80" />
      </linearGradient>
      <!-- 水彩边缘模糊 -->
      <filter id="radarBlur" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="4.5" />
      </filter>
    </defs>

    <!-- 网格：淡彩虚线，不生硬 -->
    <polygon
      v-for="(ring, i) in rings"
      :key="'ring' + i"
      :points="ring"
      fill="none"
      stroke="rgba(231, 217, 214, .9)"
      stroke-width="1"
      stroke-dasharray="4 5"
      stroke-linejoin="round"
    />
    <!-- 轴线：更淡的虚线 -->
    <line
      v-for="(p, i) in points"
      :key="'axis' + i"
      :x1="cx" :y1="cy"
      :x2="cx + Math.cos(p.angle) * radius"
      :y2="cy + Math.sin(p.angle) * radius"
      stroke="rgba(239, 227, 223, .95)" stroke-width="1" stroke-dasharray="3 5"
    />

    <!-- 水彩晕染底：模糊一层压在下方 -->
    <polygon
      :points="polygon"
      fill="url(#radarWash)"
      filter="url(#radarBlur)"
      opacity=".9"
    />
    <!-- 数据多边形：柔和渐变描边，不填充实色 -->
    <polygon
      :points="polygon"
      fill="none"
      stroke="url(#radarStroke)"
      stroke-width="2"
      stroke-linejoin="round"
      opacity=".85"
    />

    <!-- 顶点：淡彩光晕 + 柔和小圆点 -->
    <circle
      v-for="(p, i) in points"
      :key="'halo' + i"
      :cx="p.x" :cy="p.y" r="6.5"
      fill="#d3e8da" opacity=".4"
    />
    <circle
      v-for="(p, i) in points"
      :key="'dot' + i"
      :cx="p.x" :cy="p.y" r="3.2"
      fill="var(--primary-deep)" opacity=".8"
    />

    <!-- 标签 -->
    <g v-for="(p, i) in points" :key="'lbl' + i">
      <text
        :x="p.lx" :y="p.ly"
        text-anchor="middle" dominant-baseline="middle"
        :fill="labelColors[i]"
        font-size="12" font-weight="600"
      >{{ p.label }}</text>
      <text
        :x="p.lx" :y="p.ly + 14"
        text-anchor="middle" dominant-baseline="middle"
        fill="var(--text-faint)"
        font-size="11"
      >{{ p.v.toFixed(1) }}</text>
    </g>
  </svg>
</template>
