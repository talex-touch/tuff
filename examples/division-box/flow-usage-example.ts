/**
 * Flow Transfer Usage Example
 *
 * This example demonstrates how plugins can use the Flow Transfer system
 * to share data with other plugins.
 */

import type { TuffQuery, FlowPayload, FlowTargetInfo } from '@talex-touch/utils'
import { createFlowSDK, extractFlowData, isFlowTriggered } from '@talex-touch/utils/plugin/sdk'

// Simulated channel for example purposes
const mockChannel = {
  send: async (event: string, data?: any) => {
    console.log(`[IPC] ${event}:`, data)
    return { success: true, data: {} }
  }
}

// Create Flow SDK instance
const flow = createFlowSDK(mockChannel, 'example-plugin')

/**
 * Example 1: Sending text to another plugin
 */
async function sendTextToPlugin() {
  const payload: FlowPayload = {
    type: 'text',
    data: 'Hello from Example Plugin!',
    context: {
      sourcePluginId: 'example-plugin',
      metadata: {
        timestamp: Date.now()
      }
    }
  }

  try {
    // Option A: Let user select target
    const result = await flow.dispatch(payload, {
      title: 'Share Text',
      description: 'Send this text to another plugin'
    })
    console.log('Flow dispatched:', result)

    // Option B: Send to specific target
    const directResult = await flow.dispatch(payload, {
      preferredTarget: 'notes-plugin.quick-capture',
      skipSelector: true
    })
    console.log('Direct flow:', directResult)
  } catch (error) {
    console.error('Flow failed:', error)
  }
}

/**
 * Example 2: Sending structured data (JSON)
 */
async function sendStructuredData() {
  const payload: FlowPayload = {
    type: 'json',
    data: {
      title: 'Meeting Notes',
      content: 'Discussed project roadmap...',
      tags: ['meeting', 'important'],
      createdAt: new Date().toISOString()
    },
    context: {
      sourcePluginId: 'example-plugin',
      sourceFeatureId: 'create-note'
    }
  }

  const result = await flow.dispatch(payload, {
    title: 'Save Note',
    requireAck: true, // Wait for target to acknowledge
    timeout: 10000,
    fallbackAction: 'copy' // Copy to clipboard if flow fails
  })

  if (result.state === 'ACKED') {
    console.log('Note saved! Response:', result.ackPayload)
  }
}

/**
 * Example 3: Getting available targets
 */
async function listAvailableTargets() {
  // Get all targets
  const allTargets = await flow.getAvailableTargets()
  console.log('All targets:', allTargets)

  // Get targets that accept text
  const textTargets = await flow.getAvailableTargets('text')
  console.log('Text targets:', textTargets)

  // Get targets that accept images
  const imageTargets = await flow.getAvailableTargets('image')
  console.log('Image targets:', imageTargets)
}

/**
 * Example 4: Receiving flow data in a feature
 *
 * When your plugin is a Flow target, the flow data will be
 * included in the TuffQuery when your feature is triggered.
 */
function handleFeatureTrigger(featureId: string, query: TuffQuery) {
  // Check if this was triggered via Flow
  if (isFlowTriggered(query)) {
    const flowData = extractFlowData(query)
    if (flowData) {
      console.log('Received flow from:', flowData.senderId)
      console.log('Payload type:', flowData.payload.type)
      console.log('Payload data:', flowData.payload.data)

      // Process the flow data
      processFlowPayload(flowData.sessionId, flowData.payload)
    }
  } else {
    // Normal feature trigger (not from Flow)
    console.log('Normal trigger with query:', query.text)
  }
}

/**
 * Example 5: Processing received flow and sending acknowledgment
 */
async function processFlowPayload(sessionId: string, payload: FlowPayload) {
  try {
    // Process the payload based on type
    let result: any

    switch (payload.type) {
      case 'text':
        result = await saveTextNote(payload.data as string)
        break
      case 'json':
        result = await saveStructuredNote(payload.data as object)
        break
      case 'image':
        result = await saveImage(payload.data as string)
        break
      default:
        throw new Error(`Unsupported payload type: ${payload.type}`)
    }

    // Send acknowledgment back to sender
    await flow.acknowledge(sessionId, {
      success: true,
      noteId: result.id,
      message: 'Note saved successfully'
    })
  } catch (error) {
    // Report error to sender
    await flow.reportError(
      sessionId,
      error instanceof Error ? error.message : 'Failed to process flow'
    )
  }
}

// Mock processing functions
async function saveTextNote(text: string) {
  console.log('Saving text note:', text)
  return { id: 'note-123' }
}

async function saveStructuredNote(data: object) {
  console.log('Saving structured note:', data)
  return { id: 'note-456' }
}

async function saveImage(dataUrl: string) {
  console.log('Saving image:', dataUrl.substring(0, 50) + '...')
  return { id: 'image-789' }
}

/**
 * Example 6: Manifest configuration for Flow targets
 *
 * Add this to your plugin's manifest.json to declare Flow targets:
 *
 * {
 *   "name": "notes-plugin",
 *   "version": "1.0.0",
 *   "capabilities": {
 *     "flowSender": true
 *   },
 *   "flowTargets": [
 *     {
 *       "id": "quick-capture",
 *       "name": "Quick Capture",
 *       "description": "Quickly save content as a note",
 *       "supportedTypes": ["text", "json", "html"],
 *       "icon": "ri:sticky-note-line",
 *       "featureId": "create-note"
 *     },
 *     {
 *       "id": "image-gallery",
 *       "name": "Save to Gallery",
 *       "description": "Save images to your gallery",
 *       "supportedTypes": ["image"],
 *       "icon": "ri:image-line",
 *       "featureId": "save-image"
 *     }
 *   ]
 * }
 */

// Export for demonstration
export {
  sendTextToPlugin,
  sendStructuredData,
  listAvailableTargets,
  handleFeatureTrigger,
  processFlowPayload
}
