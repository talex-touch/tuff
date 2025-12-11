/**
 * CORS middleware for API routes
 * Enables cross-origin requests for the market API endpoints
 */
export default defineEventHandler((event) => {
  const path = event.path

  // Only apply CORS to API routes
  if (!path.startsWith('/api/')) {
    return
  }

  // Set CORS headers
  setResponseHeaders(event, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
    'Access-Control-Max-Age': '86400',
  })

  // Handle preflight requests
  if (event.method === 'OPTIONS') {
    event.node.res.statusCode = 204
    event.node.res.statusMessage = 'No Content'
    return ''
  }
})
