/**
 * Project & environment domain types (planning/08 §4–5).
 * `Environment` is defined minimally here for the default-environment seam
 * (planning/06 §2); the Environment Manager module (Sprint 8) owns its full shape.
 */

export interface ProjectInput {
  origin: string
  openApiUrl: string
  docType: string
}

export interface ProjectMeta {
  id: string
  name: string
  originUrl: string
  openApiUrl: string
  docType: string
  createdAt: number
  lastActiveEnvId: string
}

export interface Environment {
  id: string
  name: string
  baseUrl: string
  variables: Record<string, string>
  description?: string
  authRef?: string
  updatedAt: number
}

export const DEFAULT_ENVIRONMENT_ID = 'default'
