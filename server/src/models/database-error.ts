/**
 * A failure talking to the database. Carries only the error code and message, never the row/`details` text that
 * Postgres may include (which can contain personal data), so it is safe to log.
 */
export class DatabaseError extends Error {
  code: string | null
  constructor(message: string, code: string | null = null) {
    super(message)
    this.name = 'DatabaseError'
    this.code = code
  }
}
