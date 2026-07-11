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
      name: 'soketiHost',
      type: 'text',
      label: 'Soketi WebSocket Host',
      admin: {
        condition: (_data, siblingData) => siblingData?.mode === 'self-hosted',
        description: 'The public domain or IP of your Soketi instance (e.g., asaas-soketi-xxx.sslip.io).',
      },
    },
    {
      name: 'soketiPort',
      type: 'number',
      label: 'Soketi Port',
      defaultValue: 6001,
      admin: {
        condition: (_data, siblingData) => siblingData?.mode === 'self-hosted',
      },
    },
    {
      name: 'soketiAppId',
      type: 'text',
      label: 'Soketi App ID',
      admin: {
        condition: (_data, siblingData) => siblingData?.mode === 'self-hosted',
        description: 'Usually "app-id" by default unless changed in Soketi env vars.',
      },
    },
    {
      name: 'soketiAppKey',
      type: 'text',
      label: 'Soketi App Key',
      admin: {
        condition: (_data, siblingData) => siblingData?.mode === 'self-hosted',
        description: 'The public key used by your frontend React app (e.g., "app-key").',
      },
    },
    {
      name: 'soketiAppSecret',
      type: 'text',
      label: 'Soketi App Secret',
      admin: {
        condition: (_data, siblingData) => siblingData?.mode === 'self-hosted',
        description: 'The private secret used by the CMS backend to authenticate dispatches. Keep this safe!',
      },
    },
    {
      name: 'appriseUrl',
      type: 'text',
      label: 'Apprise Base URL',
      admin: {
        condition: (_data, siblingData) => siblingData?.mode === 'self-hosted',
        description: 'Base URL of your Apprise server (e.g. https://apprise.example.com).',
      },
    },
    {
      name: 'appriseConfigKey',
      type: 'text',
      label: 'Apprise Config Key',
      defaultValue: 'apprise',
      admin: {
        condition: (_data, siblingData) => siblingData?.mode === 'self-hosted',
        description: 'The configuration key/ID configured on your Apprise server (used in /notify/{key}).',
      },
    },
    {
      name: 'appriseBearerToken',
      type: 'text',
      label: 'Apprise Bearer Token',
      admin: {
        condition: (_data, siblingData) => siblingData?.mode === 'self-hosted',
        description: 'Optional. The Authorization Bearer token if your Apprise instance is secured.',
      },
    },
    {
      name: 'appriseTags',
      type: 'text',
      label: 'Apprise Tags',
      admin: {
        condition: (_data, siblingData) => siblingData?.mode === 'self-hosted',
        description: 'Optional. Comma-separated list of tags to filter which services receive the notification.',
      },
    },
  ],
}
