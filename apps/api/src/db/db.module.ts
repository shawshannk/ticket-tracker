import { Global, Module } from '@nestjs/common';
import { createDb, type Db } from './index';

/**
 * The Drizzle connection as a Nest provider. Global so feature modules can inject
 * `DB` without importing DbModule everywhere. M2 left `createDb()` as a plain
 * factory; this is where it enters the DI container.
 */
export const DB = Symbol('DB');

@Global()
@Module({
  providers: [{ provide: DB, useFactory: (): Db => createDb() }],
  exports: [DB],
})
export class DbModule {}
