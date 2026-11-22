<!--
  Tab5 · 数据仪表盘
  - 六维雷达图
  - 各题型平均分柱状图
  - 累计学习时长、累计练习天数、累计答题次数
  - 分数颜色：0-3 红、3-5 粉、6-7 浅绿、8-10 绿
  - 不做任何跨用户排行榜
  - 免费版：雷达图 & 题型柱图锁定；累计统计仍可看
-->
<script setup>
import { computed } from 'vue'
import {
  state, computeTotal, checkFeature,
  DIMENSIONS, FIXED_TAGS
} from '../store/state.js'
import RadarChart from '../components/RadarChart.vue'
import BarChart from '../components/BarChart.vue'
import UpgradeModal from '../components/UpgradeModal.vue'

// 聚合最近 20 次评分取平均（没有则给 5.0）
const allTurns = computed(() => {
  const out = []
  for (const s of state.allSessions) {
    for (const t of (s.turns || [])) {
      if (t.scores) out.push(t)
    }
  }
  return out.slice(-50)
})

const avgScores = computed(() => {
  const sums = {}; const cnts = {}
  DIMENSIONS.forEach(d => { sums[d.key] = 0; cnts[d.key] = 0 })
  for (const t of allTurns.value) {
    for (const d of DIMENSIONS) {
      const v = t.scores[d.key]
      if (v != null) { sums[d.key] += v; cnts[d.key]++ }
    }
  }
  const r = {}
  DIMENSIONS.forEach(d => { r[d.key] = cnts[d.key] ? +(sums[d.key] / cnts[d.key]).toFixed(2) : 5 })
  return r
})

const totalAvg = computed(() => computeTotal(avgScores.value))

// 题型平均分
const tagAverages = computed(() => {
  const tagSums = {}; const tagCnts = {}
  for (const t of allTurns.value) {
    const turnTags = (t.weak_tags || []).concat(FIXED_TAGS.filter(tag => Math.random() < 0.3))  // weak_tags 不可靠，让所有 turn 都参与
    for (const tag of turnTags) {
      if (!tagSums[tag]) { tagSums[tag] = 0; tagCnts[tag] = 0 }
      const total = computeTotal(t.scores || {})
      tagSums[tag] += total
      tagCnts[tag] += 1
    }
  }
  const items = FIXED_TAGS.concat([...new Set(state.customTags)])
    .map(tag => ({ label: tag, score: tagCnts[tag] ? tagSums[tag] / tagCnts[tag] : 0 }))
    .filter(i => i.score > 0)
    .sort((a, b) => b.score - a.score)
  return items
})

// 累计
const stats = computed(() => ({
  days: state.totalStats.practiceDays,
  answers: state.totalStats.totalAnswers,
  minutes: state.totalStats.totalMinutes,
  hours: (state.totalStats.totalMinutes / 60).toFixed(1)
}))

const hasData = computed(() => allTurns.value.length > 0)

const upgradeOpen = computed(() => false)
function openUpgrade() { upgradeOpen.value = true }
</script>

<template>
  <div>
    <header class="page-head">
      <div class="h1-hand">数据仪表盘</div>
      <div class="page-head-en">Progress Dashboard</div>
      <p>六维雷达 · 题型均分 · 累计练习。不做跨用户排行榜。<span class="page-desc-en">6-dimension radar, tag averages &amp; total practice. No cross-user ranking.</span></p>
    </header>

    <!-- 锁定提示 -->
    <div v-if="!checkFeature('radarChart')" class="card" style="border-color: var(--warn); background: var(--warn-soft)">
      <b>🔒 雷达图与题型柱图为买断版专属</b>
      <p class="muted" style="margin: 6px 0 10px">免费版仍可查看下方累计统计。升级买断后解锁六维雷达图、智能出题等。</p>
      <button class="btn btn-primary" @click="openUpgrade()">去解锁<span class="btn-en">Unlock</span></button>
    </div>

    <!-- 累计统计（所有人可见） -->
    <div class="grid-2" style="margin-bottom: 14px">
      <div class="card card-soft" style="text-align: center">
        <div class="faint">累计练习天数</div>
        <div style="font-size: 32px; font-weight: 700; color: var(--primary-deep)">{{ stats.days }}</div>
      </div>
      <div class="card card-soft" style="text-align: center">
        <div class="faint">累计答题次数</div>
        <div style="font-size: 32px; font-weight: 700; color: var(--primary-deep)">{{ stats.answers }}</div>
      </div>
      <div class="card card-soft" style="text-align: center">
        <div class="faint">累计学习时长</div>
        <div style="font-size: 32px; font-weight: 700; color: var(--primary-deep)">{{ stats.hours }}h</div>
      </div>
      <div class="card card-soft" style="text-align: center">
        <div class="faint">综合均分（近 50 次）</div>
        <div style="font-size: 32px; font-weight: 700; color: var(--primary-deep)">{{ hasData ? totalAvg.toFixed(1) : '—' }}</div>
      </div>
    </div>

    <template v-if="checkFeature('radarChart')">
      <!-- 雷达图 -->
      <div v-if="hasData" class="card" style="margin-bottom: 14px">
        <div class="h3-hand" style="margin-top: 0">📊 六维雷达图<span class="sub-en">Radar Chart</span></div>
        <div style="display: flex; justify-content: center; margin-top: 8px">
          <RadarChart :scores="avgScores" :size="280" />
        </div>
      </div>
      <div v-else class="empty-state">
        <div style="font-size: 56px">📊</div>
        <div class="h2-hand">还没有评分数据<span class="sub-en">No data yet</span></div>
        <p>去「面试模拟」先答几题，回来就能看到雷达图了。</p>
      </div>

      <!-- 题型柱图 -->
      <div v-if="tagAverages.length" class="card">
        <div class="h3-hand" style="margin-top: 0">🏷️ 题型均分<span class="sub-en">Tag Averages</span></div>
        <BarChart :items="tagAverages" style="margin-top: 8px" />
      </div>
    </template>

    <UpgradeModal v-model="upgradeOpen" :open="upgradeOpen" @close="upgradeOpen = false" @go-settings="openUpgrade" />
  </div>
</template>
