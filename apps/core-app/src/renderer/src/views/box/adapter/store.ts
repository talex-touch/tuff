import { ref } from 'vue'

// Reactive references for apps and features
export const apps = ref<any[]>([])
export const features = ref<any[]>([])

// Search list containing apps and features
export const searchList: any = [apps, features]

// Variables for refresh cooldown management
export let lastRefreshTime = 0
export const REFRESH_COOLDOWN = 15000

export function setLastRefreshTime(time: number) {
  lastRefreshTime = time
}

// Application usage count stored in localStorage
export const appAmo: any = JSON.parse(localStorage.getItem('app-count') || '{}')