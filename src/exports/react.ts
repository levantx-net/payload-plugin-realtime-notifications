// Frontend real-time client exports.
// Import from 'payload-plugin-realtime-notifications/react' in your app.
//
// This export path has ZERO dependency on Payload CMS.
// It only requires React and pusher-js (peer dependency).

export { NotificationProvider } from '../realtime/NotificationProvider.js'
export { useConnectionStatus } from '../realtime/useConnectionStatus.js'
export { useNotifications } from '../realtime/useNotifications.js'
export { usePresence } from '../realtime/usePresence.js'
export { useTypingIndicator } from '../realtime/useTypingIndicator.js'
export { LiveIndicator } from '../realtime/LiveIndicator.js'

export type {
  ConnectionStatus,
  NotificationClientConfig,
  NotificationMessage,
  UseNotificationsOptions,
} from '../realtime/types.js'
