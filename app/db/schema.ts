import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const deviceRecords=sqliteTable('device_records',{owner:text('owner').primaryKey(),revision:integer('revision').notNull(),payload:text('payload').notNull(),updatedAt:text('updated_at').notNull()});
export const accountRecords=sqliteTable('account_records',{owner:text('owner').primaryKey(),revision:integer('revision').notNull(),payload:text('payload').notNull(),updatedAt:text('updated_at').notNull()});
export const legacyClaims=sqliteTable('legacy_claims',{device:text('device').primaryKey(),account:text('account').notNull()});

export const accountStorageLeases=sqliteTable('account_storage_leases',{owner:text('owner').primaryKey(),token:text('token').notNull(),expiresAt:integer('expires_at').notNull()});
export const accountMaintenance=sqliteTable('account_maintenance',{owner:text('owner').primaryKey(),lastCleanupAt:integer('last_cleanup_at').notNull()});
