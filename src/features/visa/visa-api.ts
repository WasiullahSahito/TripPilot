import { api } from '@/lib/api'
import { uploadFile } from '@/lib/upload'
import type { FormData } from './form-schema'

export type ApplicationStatus = 'draft' | 'ready' | 'submitted_on_portal'

export interface ApplicationDto {
  id: string
  destinationId: string
  categoryId: string
  nationality: string
  residence: string
  status: ApplicationStatus
  checklist: Record<string, boolean>
  data: Partial<FormData>
  updatedAt: string
}

export interface DocumentDto {
  id: string
  applicationId: string
  itemId: string
  filename: string
  mime: string
  size: number
  uploadedAt: string
}

export { ALLOWED_TYPES } from '@/lib/upload'

export const visaApi = {
  list: () => api<{ applications: ApplicationDto[] }>('/visa/applications').then((r) => r.applications),
  get: (id: string) => api<{ application: ApplicationDto; documents: DocumentDto[] }>(`/visa/applications/${id}`),
  save: (body: Omit<ApplicationDto, 'id' | 'updatedAt'>) =>
    api<{ application: ApplicationDto }>('/visa/applications', { method: 'PUT', body }).then((r) => r.application),
  remove: (id: string) => api<void>(`/visa/applications/${id}`, { method: 'DELETE' }),
  deleteDocument: (id: string) => api<void>(`/visa/documents/${id}`, { method: 'DELETE' }),
  documentUrl: (id: string) => `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/visa/documents/${id}`,

  async upload(applicationId: string, itemId: string, file: File): Promise<DocumentDto> {
    return (await uploadFile({ kind: 'visa', ownerId: applicationId, itemId }, file)).document
  },
}
