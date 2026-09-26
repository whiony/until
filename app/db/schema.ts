import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const deviceRecords=sqliteTable('device_records',{owner:text('owner').primaryKey(),revision:integer('revision').notNull(),payload:text('payload').notNull(),updatedAt:text('updated_at').notNull()});
export const accountRecords=sqliteTable('account_records',{owner:text('owner').primaryKey(),revision:integer('revision').notNull(),payload:text('payload').notNull(),updatedAt:text('updated_at').notNull()});
export const legacyClaims=sqliteTable('legacy_claims',{device:text('device').primaryKey(),account:text('account').notNull()});
