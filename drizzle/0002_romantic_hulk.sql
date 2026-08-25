CREATE INDEX "conversation_userId_idx" ON "conversation" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "message_conversationId_idx" ON "message" USING btree ("conversationId");