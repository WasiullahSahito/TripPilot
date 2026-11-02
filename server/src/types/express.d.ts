import type { Session } from '../services/auth-service.ts'

declare global {
  namespace Express {
    interface Request {
      session?: Session
    }
  }
}

export {}
