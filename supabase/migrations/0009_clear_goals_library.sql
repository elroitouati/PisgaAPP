-- =============================================================================
-- Clears the placeholder goal-library content seeded in
-- 0002_seed_goals_library.sql. That file said so itself: "⚠ PROPOSAL, PENDING
-- REVIEW... a first draft meant to be edited, not a settled spec." The
-- product team is now delivering the real structured-goal library (with
-- per-goal verification and personal structured-goal creation) — this makes
-- room for it rather than leaving 20 placeholder rows alongside it.
--
-- The table, its RLS, and set_goal_points() are untouched — this is content
-- only. user_goals.library_id references goals_library `on delete set null`
-- (0001), so any already-adopted goal survives as a plain (no-longer-linked)
-- entry rather than being deleted or orphaned.
-- =============================================================================

delete from goals_library;
