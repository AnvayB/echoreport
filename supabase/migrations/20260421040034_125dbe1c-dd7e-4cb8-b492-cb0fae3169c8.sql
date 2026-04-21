-- Normalize legacy section values into a strict set: completed | pending | blocker
-- Manual additions get a ":manual" suffix so they are preserved through EOD re-syncs.

UPDATE public.daily_tasks
SET section = 'completed'
WHERE section ILIKE 'Completed Yesterday%' OR section ILIKE 'completed%' AND section <> 'completed' AND section NOT LIKE 'completed:%';

UPDATE public.daily_tasks
SET section = 'pending:manual'
WHERE section ILIKE 'Pending for Today › Added Manually%';

UPDATE public.daily_tasks
SET section = 'pending'
WHERE (section ILIKE 'Pending for Today%' OR section ILIKE 'pending%')
  AND section <> 'pending'
  AND section <> 'pending:manual';

UPDATE public.daily_tasks
SET section = 'blocker'
WHERE section ILIKE 'Carryover%' OR section ILIKE 'Blocker%' OR section ILIKE 'blocker%' AND section <> 'blocker';

-- Anything else (notes, info, etc.) → fold into 'pending' if not completed, otherwise 'completed'
UPDATE public.daily_tasks
SET section = CASE WHEN completed THEN 'completed' ELSE 'pending' END
WHERE section NOT IN ('completed', 'pending', 'pending:manual', 'blocker');

-- Helpful index for the new query patterns
CREATE INDEX IF NOT EXISTS idx_daily_tasks_user_completed_date
  ON public.daily_tasks(user_id, completed, task_date);