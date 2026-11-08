-- Answer-based goal sources: a goal can count responses with a specific
-- answer (e.g. 50 "Yes" responses) or check that an answer is the most common.
ALTER TABLE initiative_goal ADD COLUMN IF NOT EXISTS source_answer TEXT;

ALTER TABLE initiative_goal DROP CONSTRAINT IF EXISTS initiative_goal_source_method_check;
ALTER TABLE initiative_goal ADD CONSTRAINT initiative_goal_source_method_check CHECK (
  source_method IS NULL OR source_method IN (
    'most_popular','average','least_common','delta_halves','linear_slope',
    'answer_count','answer_share','answer_is_most_common'
  )
);
