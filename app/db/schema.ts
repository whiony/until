import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const deviceRecords=sqliteTable('device_records',{owner:text('owner').primaryKey(),revision:integer('revision').notNull(),payload:text('payload').notNull(),updatedAt:text('updated_at').notNull()});
