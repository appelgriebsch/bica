-- When the floor (CEFR level) was last set (#15): the newer setting wins on merge.
-- ISO-8601 UTC text from Date.toISOString(); NULL for rows written before this.
ALTER TABLE user_stats ADD COLUMN floor_updated_at TEXT;
