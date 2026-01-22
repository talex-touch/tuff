import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { app } from 'electron'

/**
 * Get the CoreBox renderer URL based on environment
 * @returns URL string for loading CoreBox renderer
 */
export function getCoreBoxRendererUrl(): string {
  if (app.isPackaged) {
    const filePath = path.join(__dirname, '..', 'renderer', 'index.html')
    return pathToFileURL(filePath).href
  }

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (!devUrl) {
    throw new Error('ELECTRON_RENDERER_URL is not set in development mode')
  }

  return devUrl
}

/**
 * Get the CoreBox renderer file path (for production)
 * @returns File path string
 */
export function getCoreBoxRendererPath(): string {
  return path.join(__dirname, '..', 'renderer', 'index.html')
}

/**
 * Check if running in development mode
 */
export function isDevMode(): boolean {
  return !app.isPackaged && !!process.env.ELECTRON_RENDERER_URL
}
