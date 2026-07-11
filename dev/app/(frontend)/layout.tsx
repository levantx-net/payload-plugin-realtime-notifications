import { getPayload } from 'payload'
import type { ReactNode } from 'react'
import configPromise from '@payload-config'

import { NotificationProvider } from 'payload-plugin-realtime-notifications/react'

export default async function FrontendLayout({ children }: { children: ReactNode }) {
  // Seamless Integration: Fetch the settings directly from the CMS database!
  const payload = await getPayload({ config: configPromise })
  const settings = await payload.findGlobal({
    slug: 'notification-settings',
  })

  // Safely extract only the public variables needed for the frontend connection
  const clientConfig =
    settings.mode === 'self-hosted'
      ? {
          appKey: settings.soketiAppKey ?? 'app-key',
          wsHost: settings.soketiHost ?? 'localhost',
          wsPort: settings.soketiPort ?? 6001,
          forceTLS: false, // Set based on your Soketi deployment
          disableStats: true,
          enabledTransports: ['ws', 'wss'],
        }
      : {
          appKey: 'saas-placeholder-key', // Will be provided by SaaS Gateway later
          cluster: 'mt1',
        }

  return (
    <html lang="en">
      <body>
        {/* The provider now configures itself dynamically based on your Admin Panel settings */}
        <NotificationProvider config={clientConfig}>
          {children}
        </NotificationProvider>
      </body>
    </html>
  )
}
