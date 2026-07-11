// Frontend real-time client exports.
// Import from 'payload-plugin-realtime-notifications/react' in your app.
//
// This export path has ZERO dependency on Payload CMS.
// It only requires React and pusher-js (peer dependency).

export { NotificationProvider } from '../realtime/NotificationProvider.js'
export { useConnectionStatus } from '../realtime/useConnectionStatus.js'
export { useNotifications } from '../realtime/useNotifications.js'
export type {
  ConnectionStatus,
  NotificationClientConfig,
  NotificationMessage,
  UseNotificationsOptions,
} from '../realtime/types.js'
