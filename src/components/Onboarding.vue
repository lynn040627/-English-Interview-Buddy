<!-- 首次打开新手引导：4 步 -->
<script setup>
import { ref } from 'vue'
const emit = defineEmits(['done'])

const steps = [
  { title: '第 1 步 · 配置 Key', body: '到「设置」页填一个 API Key（DeepSeek / 豆包 / OpenAI 都可以）。Key 只保存在你本机，不会传到任何中间服务器。', emoji: '🔑' },
  { title: '第 2 步 · 录音作答', body: '回到「面试模拟」，选一个场景和难度，点 🎙️ 按钮开始录音。浏览器会自动做语音转写。', emoji: '🎙️' },
  { title: '第 3 步 · 看批改', body: '提交后 AI 会给你六维打分、地道表达建议、语法修正、逻辑优化，还有整合范文可以跟读。', emoji: '📝' },
  { title: '第 4 步 · 看仪表盘', body: '打开「数据仪表盘」，六维雷达图帮你快速定位薄弱环节。每天练 1 题，进步肉眼可见！', emoji: '📊' }
]
const idx = ref(0)
</script>

<template>
  <div class="modal-mask" @click.self="emit('done')">
    <div class="modal" style="text-align: center">
      <div style="font-size: 48px">{{ steps[idx].emoji }}</div>
      <h3>{{ steps[idx].title }}</h3>
      <p style="color: var(--text-soft); line-height: 1.7">{{ steps[idx].body }}</p>
      <div style="margin-top: 18px; display: flex; gap: 10px; justify-content: center">
        <button class="btn btn-ghost" @click="emit('done')">跳过<span class="btn-en">Skip</span></button>
        <button v-if="idx > 0" class="btn btn-ghost" @click="idx--">上一步<span class="btn-en">Prev</span></button>
        <button v-if="idx < steps.length - 1" class="btn btn-primary" @click="idx++">下一步<span class="btn-en">Next</span></button>
        <button v-else class="btn btn-primary" @click="emit('done')">开始使用 ✨<span class="btn-en">Get Started</span></button>
      </div>
      <div class="faint" style="margin-top: 14px">{{ idx + 1 }} / {{ steps.length }}</div>
    </div>
  </div>
</template>
