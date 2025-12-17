/**
 * Sentry Module Export
 */
import { SentryServiceModule, setSentryServiceInstance } from './sentry-service'

export const sentryModule = new SentryServiceModule()
setSentryServiceInstance(sentryModule)
