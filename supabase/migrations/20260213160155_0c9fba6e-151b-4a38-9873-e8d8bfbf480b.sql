
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE public.users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  join_date TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_username ON public.users (username);

-- ============================================
-- GAME SESSIONS TABLE
-- ============================================
CREATE TABLE public.game_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id),
  score INT NOT NULL CHECK (score >= 0),
  game_mode TEXT NOT NULL DEFAULT 'classic',
  played_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for aggregation queries (sum scores per user)
CREATE INDEX idx_game_sessions_user_id ON public.game_sessions (user_id);
-- Index for time-based queries
CREATE INDEX idx_game_sessions_played_at ON public.game_sessions (played_at DESC);
-- Composite index for user+score aggregation
CREATE INDEX idx_game_sessions_user_score ON public.game_sessions (user_id, score);

-- ============================================
-- LEADERBOARD TABLE (cached/materialized)
-- ============================================
CREATE TABLE public.leaderboard (
  user_id BIGINT PRIMARY KEY REFERENCES public.users(id),
  total_score BIGINT NOT NULL DEFAULT 0,
  rank INT NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for ranking queries - the critical one
CREATE INDEX idx_leaderboard_rank ON public.leaderboard (rank ASC) WHERE rank > 0;
CREATE INDEX idx_leaderboard_total_score ON public.leaderboard (total_score DESC);

-- ============================================
-- FUNCTION: Refresh top leaderboard efficiently
-- Uses partial refresh - only updates top N ranks
-- ============================================
CREATE OR REPLACE FUNCTION public.refresh_leaderboard(top_n INT DEFAULT 100)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Use a CTE to compute top scores and ranks, then upsert
  WITH ranked AS (
    SELECT
      user_id,
      SUM(score)::BIGINT AS total_score,
      RANK() OVER (ORDER BY SUM(score) DESC)::INT AS rank
    FROM public.game_sessions
    GROUP BY user_id
    ORDER BY total_score DESC
    LIMIT top_n
  )
  INSERT INTO public.leaderboard (user_id, total_score, rank, last_updated)
  SELECT user_id, total_score, rank, now()
  FROM ranked
  ON CONFLICT (user_id)
  DO UPDATE SET
    total_score = EXCLUDED.total_score,
    rank = EXCLUDED.rank,
    last_updated = now();
END;
$$;

-- ============================================
-- FUNCTION: Submit score atomically
-- Inserts game session and updates leaderboard in one transaction
-- ============================================
CREATE OR REPLACE FUNCTION public.submit_score(
  p_user_id BIGINT,
  p_score INT,
  p_game_mode TEXT DEFAULT 'classic'
)
RETURNS TABLE(new_total_score BIGINT, current_rank INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
  v_rank INT;
BEGIN
  -- Insert game session
  INSERT INTO public.game_sessions (user_id, score, game_mode)
  VALUES (p_user_id, p_score, p_game_mode);

  -- Calculate new total
  SELECT COALESCE(SUM(score), 0)::BIGINT INTO v_total
  FROM public.game_sessions
  WHERE game_sessions.user_id = p_user_id;

  -- Upsert leaderboard entry
  INSERT INTO public.leaderboard (user_id, total_score, rank, last_updated)
  VALUES (p_user_id, v_total, 0, now())
  ON CONFLICT (user_id)
  DO UPDATE SET
    total_score = v_total,
    last_updated = now();

  -- Get approximate rank (exact rank computed by cron)
  SELECT COUNT(*)::INT + 1 INTO v_rank
  FROM public.leaderboard l
  WHERE l.total_score > v_total;

  -- Update rank
  UPDATE public.leaderboard
  SET rank = v_rank
  WHERE leaderboard.user_id = p_user_id;

  new_total_score := v_total;
  current_rank := v_rank;
  RETURN NEXT;
END;
$$;

-- ============================================
-- FUNCTION: Get player rank
-- ============================================
CREATE OR REPLACE FUNCTION public.get_player_rank(p_user_id BIGINT)
RETURNS TABLE(user_id BIGINT, username TEXT, total_score BIGINT, rank INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT l.user_id, u.username, l.total_score, l.rank
  FROM public.leaderboard l
  JOIN public.users u ON u.id = l.user_id
  WHERE l.user_id = p_user_id;
END;
$$;

-- ============================================
-- RLS POLICIES (public read, no direct writes)
-- ============================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;

-- Public read access for leaderboard display
CREATE POLICY "Public read users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Public read game_sessions" ON public.game_sessions FOR SELECT USING (true);
CREATE POLICY "Public read leaderboard" ON public.leaderboard FOR SELECT USING (true);

-- Enable realtime for leaderboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.leaderboard;
