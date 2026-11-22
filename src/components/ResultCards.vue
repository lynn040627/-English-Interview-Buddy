<!-- 批改卡片：地道表达建议 → 语法问题 → 逻辑优化建议；最后范文 -->
<script setup>
import SpeakPlayer from './SpeakPlayer.vue'
import { computeTotal } from '../store/state.js'

const props = defineProps({
  review: { type: Object, required: true }
})

const totalScore = computed(() => computeTotal(props.review?.scores))
const scoreColor = computed(() => {
  const s = totalScore.value
  if (s < 3) return 'var(--danger)'
  if (s < 5) return '#d9a3ac'
  if (s < 7) return '#8fb89c'
  return 'var(--ok)'
})

import { computed } from 'vue'
import { DIMENSIONS } from '../store/state.js'
</script>

<template>
  <div class="stack">
    <!-- 总分 + 六维条形 -->
    <div class="card">
      <div class="row-spaced">
        <div>
          <div class="h3-hand">综合评分<span class="sub-en">Overall Score</span></div>
          <div class="faint">六维加权自动计算</div>
        </div>
        <div style="text-align: right">
          <div style="font-size: 36px; font-weight: 700; color: var(--primary-deep)">{{ totalScore.toFixed(1) }}</div>
          <div class="faint">/ 10</div>
        </div>
      </div>
      <div class="divider"></div>
      <div v-for="d in DIMENSIONS" :key="d.key" style="margin-bottom: 8px">
        <div class="row-spaced" style="font-size: 13px; margin-bottom: 3px">
          <span>{{ d.label }}</span>
          <span :style="{ color: scoreColor }">{{ (review.scores?.[d.key] ?? 5).toFixed(1) }}</span>
        </div>
        <div style="height: 6px; background: var(--bg-soft); border-radius: 3px">
          <div
            :style="{
              width: Math.max(2, ((review.scores?.[d.key] ?? 5) / 10 * 100)) + '%',
              background: scoreColor,
              height: '100%',
              borderRadius: 3
            }"
          ></div>
        </div>
      </div>
    </div>

    <!-- 薄弱标签 -->
    <div v-if="review.weak_tags?.length" class="card card-soft">
      <div class="muted">薄弱点</div>
      <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px">
        <span v-for="t in review.weak_tags" :key="t" class="tag tag-warn">{{ t }}</span>
      </div>
    </div>

    <!-- 深挖要点（仅深挖场景由模型返回 focus） -->
    <div v-if="review.focus?.length" class="card card-soft">
      <div class="h3-hand">🎯 深挖要点<span class="sub-en">Key Insights</span></div>
      <ul style="padding-left: 20px; line-height: 1.9">
        <li v-for="(c, i) in review.focus" :key="'f' + i">{{ c }}</li>
      </ul>
    </div>

    <!-- 批改卡片：顺序固定 -->
    <div v-if="review.cards?.natural?.length" class="card">
      <div class="h3-hand">💡 地道表达建议<span class="sub-en">Natural Expressions</span></div>
      <ul style="padding-left: 20px; line-height: 1.9">
        <li v-for="(c, i) in review.cards.natural" :key="'n' + i">{{ c }}</li>
      </ul>
    </div>
    <div v-if="review.cards?.grammar?.length" class="card">
      <div class="h3-hand">📝 语法修正<span class="sub-en">Grammar Fixes</span></div>
      <ul style="padding-left: 20px; line-height: 1.9">
        <li v-for="(c, i) in review.cards.grammar" :key="'g' + i">{{ c }}</li>
      </ul>
    </div>
    <div v-if="review.cards?.logic?.length" class="card">
      <div class="h3-hand">🧠 逻辑优化<span class="sub-en">Logic Optimization</span></div>
      <ul style="padding-left: 20px; line-height: 1.9">
        <li v-for="(c, i) in review.cards.logic" :key="'l' + i">{{ c }}</li>
      </ul>
    </div>

    <!-- 整合范文 -->
    <div v-if="review.sample_answer" class="card">
      <div class="h3-hand">✨ 整合范文<span class="sub-en">Sample Answer</span></div>
      <p class="en-body" style="white-space: pre-wrap; line-height: 1.75; color: var(--text)">{{ review.sample_answer }}</p>
      <div class="row" style="margin-top: 10px">
        <SpeakPlayer :text="review.sample_answer" label="播放范文" />
      </div>
    </div>
  </div>
</template>
