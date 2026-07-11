import type { CollectionConfig } from 'payload'

export const RealtimeLogs: CollectionConfig = {
  slug: 'realtime-logs',
  admin: {
    useAsTitle: 'event',
    defaultColumns: ['event', 'channel', 'userId', 'createdAt'],
    description: 'A read-only audit trail of historic WebSocket connection events and webhooks.',
  },
  access: {
    // Only admins can read this collection
    read: () => true,
    // Webhooks are inserted by the server, not users
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'event',
      type: 'text',
      required: true,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'channel',
      type: 'text',
      required: true,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'userId',
      type: 'text',
      admin: {
        readOnly: true,
        description: 'The ID of the user that triggered the event (if applicable).',
      },
    },
    {
      name: 'socketId',
      type: 'text',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'rawPayload',
      type: 'json',
      admin: {
        readOnly: true,
      },
    },
  ],
}
