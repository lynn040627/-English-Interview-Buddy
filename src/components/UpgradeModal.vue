<!-- 升级弹窗：免费版触发受限功能时弹出；notice 可覆盖默认文案 -->
<script setup>
defineProps({
  open: Boolean,
  notice: { type: String, default: '' }
})
const emit = defineEmits(['close', 'goSettings'])
</script>

<template>
  <div v-if="open" class="modal-mask" @click.self="emit('close')">
    <div class="modal">
      <h3>🔓 解锁全部高级功能</h3>
      <p v-if="notice" style="color: var(--text-soft); line-height: 1.7">{{ notice }}</p>
      <template v-else>
        <p style="color: var(--text-soft); line-height: 1.7">
          免费版每天可以练 <b>1 道</b> 题库题。升级买断版后：
        </p>
        <ul style="padding-left: 20px; color: var(--text-soft); line-height: 1.9">
          <li>六维雷达图 & 智能出题</li>
          <li>英文文本精读 & 背诵模式</li>
          <li>连环追问 & PDF 导入/导出</li>
          <li>自我介绍多轮迭代 & 无限制练题</li>
        </ul>
      </template>
      <p class="faint">一次性买断，所有数据仍只存你本机。</p>
      <div style="display: flex; gap: 10px; margin-top: 16px">
        <button class="btn btn-ghost" @click="emit('close')">稍后再说<span class="btn-en">Later</span></button>
        <button class="btn btn-primary" style="flex: 1" @click="emit('goSettings')">去设置页输入解锁码<span class="btn-en">Go to Settings</span></button>
      </div>
    </div>
  </div>
</template>
