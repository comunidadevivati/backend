// Violação de restrição UNIQUE do PostgreSQL (SQLSTATE 23505). O Drizzle encapsula o erro do
// driver em `cause`, então ambos os níveis são verificados.
export const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Error &&
  [error, error.cause].some(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'code' in candidate &&
      candidate.code === '23505',
  );
