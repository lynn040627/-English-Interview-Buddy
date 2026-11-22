<!--
  App.vue —— 6 个 Tab 的 SPA 根组件
  模块：自我介绍打磨 / 面试模拟 / 英文文本精读 / 题库与收藏 / 数据仪表盘 / 设置
-->
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import TopTabs from './components/TopTabs.vue'
import ToastHost from './components/ToastHost.vue'
import Onboarding from './components/Onboarding.vue'
import IntroView from './views/IntroView.vue'
import ResumeView from './views/ResumeView.vue'
import MockView from './views/MockView.vue'
import ReadView from './views/ReadView.vue'
import BankView from './views/BankView.vue'
import DashboardView from './views/DashboardView.vue'
import SettingsView from './views/SettingsView.vue'
import { state, initStore } from './store/state.js'
import { isConfigured } from './lib/llm.js'
import { toast } from './composables/useUi.js'

// Tab 定义：顺序即展示顺序
const tabs = [
  { key: 'intro',     label: '自我介绍打磨', en: 'Intro',    icon: '👋' },
  { key: 'resume',    label: '简历深挖',     en: 'Resume',   icon: '🔎' },
  { key: 'mock',      label: '面试模拟',     en: 'Mock',     icon: '🎙️' },
  { key: 'read',      label: '文本精读',     en: 'Reading',  icon: '📖' },
  { key: 'bank',      label: '题库与收藏',   en: 'Bank',     icon: '📚' },
  { key: 'dashboard', label: '数据仪表盘',   en: 'Stats',    icon: '📊' },
  { key: 'settings',  label: '设置',         en: 'Settings', icon: '⚙️' }
]

const activeTab = ref('intro')
const showOnboarding = ref(false)

function onNavigate(e) {
  const key = e.detail
  const tabMap = { settings: 'settings', mock: 'mock', bank: 'bank', resume: 'resume' }
  if (tabMap[key]) activeTab.value = tabMap[key]
}

onMounted(() => {
  try { initStore() } catch (e) {
    console.error('store init failed', e)
    toast.err('本地存储初始化失败，请导出备份后清理数据重试')
  }

  // 监听子组件跨 Tab 跳转
  window.addEventListener('spk:navigate', onNavigate)

  // 首次打开弹出新手引导
  if (!state.onboardingDone) {
    showOnboarding.value = true
  }

  // 未配置 Key 自动跳设置
  if (!state.settings.apiKey) {
    activeTab.value = 'settings'
  }
})

onUnmounted(() => {
  window.removeEventListener('spk:navigate', onNavigate)
})

function onOnboardingDone() {
  showOnboarding.value = false
  state.onboardingDone = true
}
</script>

<template>
  <div class="app-wrap">
    <TopTabs :tabs="tabs" v-model="activeTab" />

    <main class="page">
      <IntroView     v-show="activeTab === 'intro'" />
      <ResumeView    v-show="activeTab === 'resume'" :active="activeTab === 'resume'" />
      <MockView      v-show="activeTab === 'mock'" />
      <ReadView      v-show="activeTab === 'read'" />
      <BankView      v-show="activeTab === 'bank'" />
      <DashboardView v-show="activeTab === 'dashboard'" />
      <SettingsView  v-show="activeTab === 'settings'" />
    </main>

    <Onboarding v-if="showOnboarding" @done="onOnboardingDone" />
    <ToastHost />
  </div>
</template>
