import type { ReactNode } from 'react'

import { NotificationProvider } from 'payload-plugin-realtime-notifications/react'

export default function FrontendLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NotificationProvider
          config={{
            appKey: 'test-app-key',
            wsHost: 'localhost',
            wsPort: 8080,
            forceTLS: false,
            disableStats: true,
            enabledTransports: ['ws', 'wss'],
          }}
        >
          {children}
        </NotificationProvider>
      </body>
    </html>
  )
}
