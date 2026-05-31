-- M6 (NFR-008): outbox reliability — add a DEAD (dead-letter) status + a dedupe_key for idempotent
-- enqueue. NOTE: `ALTER TYPE ... ADD VALUE` runs inside the migrator's transaction; this is safe on
-- PostgreSQL 12+ because the new value 'DEAD' is NOT referenced in this migration (the relay writes
-- it only at runtime, after this transaction commits).
ALTER TYPE "public"."outbox_status" ADD VALUE 'DEAD';--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD COLUMN "dedupe_key" varchar(200);--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_dedupe_key_unique" ON "outbox_messages" USING btree ("dedupe_key") WHERE dedupe_key is not null;