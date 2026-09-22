import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Códigos estables de los errores de negocio (specs/22 §7): la app decide por `code`, no leyendo el texto. */
export type BusinessErrorCode =
  | 'INSUFFICIENT_STOCK'
  | 'SESSION_CLOSED'
  | 'SESSION_ALREADY_OPEN'
  | 'NOT_SESSION_OWNER'
  | 'ID_IN_USE'
  | 'BARCODE_TAKEN'
  | 'ALREADY_CANCELLED';

/**
 * Un error de negocio: el cuerpo estándar de Nest (`statusCode`, `message`, `error`) **más** un `code` estable y, si hace
 * falta, datos extra (p. ej. `productId` y `available` en `INSUFFICIENT_STOCK`). `message` va en español, exacto como
 * en los specs.
 */
export function businessError(
  status: HttpStatus,
  message: string,
  code: BusinessErrorCode,
  extra: Record<string, unknown> = {},
): HttpException {
  return new HttpException(
    {
      statusCode: status,
      message,
      error: HttpStatus[status] ?? 'Error',
      code,
      ...extra,
    },
    status,
  );
}

/** Un `id` (o un código) que ya usa otra fila: en las escrituras móviles significa "es de otro negocio o usuario". */
export function idInUse(): HttpException {
  return businessError(
    HttpStatus.CONFLICT,
    'El identificador ya está en uso',
    'ID_IN_USE',
  );
}

/** `P2002` de Prisma: se violó una restricción única (llave primaria o índice único). */
export function isUniqueViolation(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
  );
}
