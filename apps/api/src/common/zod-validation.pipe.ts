import type { PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Validates a request body against a schema from `packages/shared`, so the API enforces
 * exactly the rules the frontend mirrors (spec 00, "Interface boundaries").
 *
 * M22: the ZodError is rethrown **as-is** rather than being wrapped in a BadRequestException.
 * `AllExceptionsFilter` maps it to the 400 envelope, which keeps the issue list structured all
 * the way to the response instead of flattening it into a message string here.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    return this.schema.parse(value);
  }
}
