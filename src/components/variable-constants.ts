export interface VariableSuggestion {
  name: string
  kind: 'project' | 'dynamic'
  preview?: string
  description?: string
  isSecret?: boolean
}

export const DYNAMIC_VARIABLE_SUGGESTIONS: VariableSuggestion[] = [
  {
    name: '$uuid',
    kind: 'dynamic',
    description: 'Random v4 UUID',
    preview: '550e8400-e29b-41d4-a716-446655440000',
  },
  {
    name: '$timestamp',
    kind: 'dynamic',
    description: 'Unix timestamp in seconds',
    preview: '1725380000',
  },
  {
    name: '$isoDate',
    kind: 'dynamic',
    description: 'Current ISO 8601 timestamp',
    preview: '2026-09-03T22:00:00.000Z',
  },
  {
    name: '$randomEmail',
    kind: 'dynamic',
    description: 'Random email address',
    preview: 'user@example.com',
  },
  {
    name: '$randomName',
    kind: 'dynamic',
    description: 'Random full name',
    preview: 'Alex Johnson',
  },
  {
    name: '$randomInt',
    kind: 'dynamic',
    description: 'Random integer (0-1000)',
    preview: '482',
  },
  {
    name: '$randomBoolean',
    kind: 'dynamic',
    description: 'Random true/false',
    preview: 'true',
  },
  {
    name: '$randomPhone',
    kind: 'dynamic',
    description: 'Random phone number',
    preview: '+1-555-0199',
  },
  {
    name: '$randomUrl',
    kind: 'dynamic',
    description: 'Random website URL',
    preview: 'https://example.com',
  },
]
