import type { GlobalConfig } from 'payload'

/**
 * The `notification-settings` Global stores the plugin's configuration
 * in the consumer's database. It controls whether notifications are
 * enabled, the delivery mode, and the credentials for either the
 * managed SaaS gateway or a self-hosted infrastructure.
 *
 * The default admin edit view is overridden in Phase 2 with a custom
 * React dashboard component (`NotificationDashboard.tsx`).
 */
export const NotificationSettings: GlobalConfig = {
  slug: 'notification-settings',
  label: 'Notification Settings',

  // ------------------------------------------------------------------
  // Access Control — only admins may read or modify these settings.
  // ------------------------------------------------------------------
  access: {
    read: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
  },

  // ------------------------------------------------------------------
  // Admin UI Configuration
  // ------------------------------------------------------------------
  admin: {
    group: 'Plugins',
  },

  // ------------------------------------------------------------------
  // Fields
  // ------------------------------------------------------------------
  fields: [
    // ---- Master Toggle ----
    {
      name: 'enabled',
      type: 'checkbox',
      label: 'Enable Notifications',
      defaultValue: false,
      admin: {
        description:
          'Master switch. When disabled, all notification dispatches are silently skipped.',
      },
    },

    // ---- Delivery Mode ----
    {
      name: 'mode',
      type: 'select',
      label: 'Delivery Mode',
      defaultValue: 'saas',
      options: [
        { label: 'Managed (SaaS)', value: 'saas' },
        { label: 'Self-Hosted', value: 'self-hosted' },
      ],
      admin: {
        description: 'Choose between the managed cloud gateway or your own infrastructure.',
      },
    },

    // ---- Dashboard / Usage Metrics UI ----
    {
      name: 'dashboardUI',
      type: 'ui',
      admin: {
        components: {
          Field: 'payload-plugin-realtime-notifications/client#NotificationDashboard',
        },
        condition: (_data, siblingData) => siblingData?.mode === 'saas',
      },
    },

    // ---- SaaS Fields (visible when mode = 'saas') ----
    {
      name: 'saasApiKey',
      type: 'text',
      label: 'SaaS API Key',
      admin: {
        condition: (_data, siblingData) => siblingData?.mode === 'saas',
        description: 'Automatically populated after the OAuth handshake. Do not edit manually.',
        readOnly: true,
      },
    },
    {
      name: 'tenantId',
      type: 'text',
      label: 'Tenant ID',
      admin: {
        condition: (_data, siblingData) => siblingData?.mode === 'saas',
        description: 'Your unique tenant identifier on the SaaS platform.',
        readOnly: true,
      },
    },

    // ---- Self-Hosted Fields (visible when mode = 'self-hosted') ----
    {
      name: 'sockudoUrl',
      type: 'text',
      label: 'Sockudo WebSocket URL',
      admin: {
        condition: (_data, siblingData) => siblingData?.mode === 'self-hosted',
        description: 'Base URL of your Sockudo instance (e.g. https://ws.example.com).',
      },
    },
    {
      name: 'appriseUrl',
      type: 'text',
      label: 'Apprise Notification URL',
      admin: {
        condition: (_data, siblingData) => siblingData?.mode === 'self-hosted',
        description: 'Base URL of your Apprise instance (e.g. https://apprise.example.com).',
      },
    },
  ],
}
