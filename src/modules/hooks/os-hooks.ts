import { ref, watch } from 'vue'

export function useCPUUsage() {
    const value = ref(process.getCPUUsage())

    let cancel = false

    async function running() {
        value.value = process.getCPUUsage()

        if ( !cancel )
            setTimeout(running, 1000)
    }

    running().then(r => {})

    return [value, () => cancel = true]
}

export function useMemoryUsage() {
    const value = ref()

    let cancel = false

    async function running() {
        value.value = process.memoryUsage()

        if ( !cancel )
            setTimeout(running, 1000)
    }

    running().then(r => {})

    return [value, () => cancel = true]
}