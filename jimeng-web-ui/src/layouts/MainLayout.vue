<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useSettingsStore } from '../stores/settings.store'
import { useCreditStore } from '../stores/credit.store'
import { apiService } from '../services/api.service'
import AppHeader from '../components/layout/AppHeader.vue'
import AppSidebar from '../components/layout/AppSidebar.vue'

const settingsStore = useSettingsStore()
const creditStore = useCreditStore()
const sidebarOpen = ref(false)
const showSettingsModal = ref(false)

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

function closeSidebar() {
  sidebarOpen.value = false
}

function openSettings() {
  showSettingsModal.value = true
}

function closeSettings() {
  showSettingsModal.value = false
}

onMounted(() => {
  settingsStore.loadFromStorage()

  // 已取消首次访问自动弹出设置弹窗，用户可通过页头/侧栏自行打开设置
  if (settingsStore.isConfigured) {
    apiService.setConfig({
      baseUrl: settingsStore.apiBaseUrl,
      sessionId: settingsStore.sessionId,
      region: settingsStore.region
    })
    creditStore.fetchCredit()
  }
})

// 监听配置变化,自动刷新积分
watch(
  () => settingsStore.isConfigured,
  (isConfigured) => {
    if (isConfigured) {
      apiService.setConfig({
        baseUrl: settingsStore.apiBaseUrl,
        sessionId: settingsStore.sessionId,
        region: settingsStore.region
      })
      creditStore.fetchCredit()
    } else {
      creditStore.clearCredit()
    }
  }
)
</script>

<template>
  <div class="h-screen flex flex-col bg-gray-50 overflow-hidden">
    <!-- Header -->
    <AppHeader 
      @toggle-sidebar="toggleSidebar" 
      @open-settings="openSettings"
    />

    <div class="flex flex-1 overflow-hidden">
      <!-- Sidebar -->
      <AppSidebar 
        :is-open="sidebarOpen" 
        @close="closeSidebar"
      />

      <!-- Main content area -->
      <main class="flex-1 overflow-y-auto">
        <div class="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
          <slot />
        </div>
      </main>
    </div>

    <!-- Settings Modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showSettingsModal"
          class="fixed inset-0 z-50 flex items-center justify-center"
        >
          <!-- Backdrop -->
          <div 
            class="absolute inset-0 bg-black/50 transition-opacity"
            @click="closeSettings"
          />
          
          <!-- Modal content -->
          <div class="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 transform transition-all">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-semibold text-gray-900">
                设置
              </h2>
              <button
                type="button"
                class="p-1 rounded-md text-gray-400 hover:text-gray-600 transition-colors"
                @click="closeSettings"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div class="space-y-4">
              <!-- Session ID -->
              <div class="space-y-2">
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  Session ID
                </label>
                <input
                  type="text"
                  :value="settingsStore.sessionId"
                  @input="settingsStore.setConfig({ sessionId: ($event.target as HTMLInputElement).value })"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  placeholder="Enter your Session ID"
                />
                
                <p class="text-xs text-gray-500">
                  请手动输入 Session ID，或在设置页使用「从 API 获取」
                </p>
              </div>

              <!-- Region -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  区域
                </label>
                <select
                  :value="settingsStore.region"
                  @change="settingsStore.setConfig({ region: ($event.target as HTMLSelectElement).value as any })"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                >
                  <option value="cn">国内站 (cn)</option>
                  <option value="us">美区 (us)</option>
                  <option value="hk">香港 (hk)</option>
                  <option value="jp">日本 (jp)</option>
                  <option value="sg">新加坡 (sg)</option>
                </select>
              </div>

              <!-- API Base URL -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  API Base URL
                </label>
                <input
                  type="text"
                  :value="settingsStore.apiBaseUrl"
                  @input="settingsStore.setConfig({ apiBaseUrl: ($event.target as HTMLInputElement).value })"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  placeholder="http://localhost:5100"
                />
              </div>
            </div>

            <div class="flex gap-3 mt-6">
              <button
                type="button"
                class="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                @click="settingsStore.clearConfig()"
              >
                清除
              </button>
              <button
                type="button"
                class="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
                @click="closeSettings"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
