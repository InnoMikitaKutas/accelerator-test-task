CREATE INDEX "share_links_created_id_idx" ON "share_links" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "approvals_requested_id_idx" ON "child_purchase_approvals" USING btree ("requested_at","id");--> statement-breakpoint
ALTER TABLE "player_profiles" ADD CONSTRAINT "player_age_range" CHECK (age IS NULL OR (age BETWEEN 1 AND 18));