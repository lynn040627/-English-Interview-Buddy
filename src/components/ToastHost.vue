<!-- Toast 宿主：挂在 App 根部 -->
<script setup>
import { toast } from '../composables/useUi.js'
</script>

<template>
  <div class="toast-host">
    <div
      v-for="t in toast.list"
      :key="t.id"
      class="toast"
      :class="t.kind"
    >{{ t.msg }}</div>
  </div>
</template>
