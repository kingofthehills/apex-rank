
-- Batch seed function for users
CREATE OR REPLACE FUNCTION public.seed_users_batch(p_offset INT, p_batch_size INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (username, join_date)
  SELECT
    'player_' || i,
    now() - (random() * interval '365 days')
  FROM generate_series(p_offset + 1, p_offset + p_batch_size) AS i
  ON CONFLICT (username) DO NOTHING;
END;
$$;

-- Batch seed function for game sessions
CREATE OR REPLACE FUNCTION public.seed_sessions_batch(p_offset INT, p_batch_size INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_user_id BIGINT;
BEGIN
  SELECT MAX(id) INTO max_user_id FROM public.users;
  IF max_user_id IS NULL THEN
    RAISE EXCEPTION 'No users found. Seed users first.';
  END IF;

  INSERT INTO public.game_sessions (user_id, score, game_mode, played_at)
  SELECT
    (floor(random() * max_user_id) + 1)::BIGINT,
    (floor(random() * 10000) + 1)::INT,
    CASE (floor(random() * 3))::INT
      WHEN 0 THEN 'classic'
      WHEN 1 THEN 'ranked'
      ELSE 'arcade'
    END,
    now() - (random() * interval '90 days')
  FROM generate_series(1, p_batch_size);
END;
$$;
