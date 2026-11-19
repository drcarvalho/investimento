-- Investimento Flash — Migração Opcional para Multiusuário (Supabase Auth + RLS)
-- Execute este script no Supabase SQL Editor apenas quando quiser ativar contas individuais.

ALTER TABLE investments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE stock_notes ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE watchlists ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_investments_user ON investments (user_id);
CREATE INDEX IF NOT EXISTS idx_stock_notes_user ON stock_notes (user_id);
CREATE INDEX IF NOT EXISTS idx_watchlists_user ON watchlists (user_id);

ALTER TABLE investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_investments" ON investments;
CREATE POLICY "users_own_investments" ON investments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_own_stock_notes" ON stock_notes;
CREATE POLICY "users_own_stock_notes" ON stock_notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_own_watchlists" ON watchlists;
CREATE POLICY "users_own_watchlists" ON watchlists
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_own_watchlist_items" ON watchlist_items;
CREATE POLICY "users_own_watchlist_items" ON watchlist_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM watchlists w WHERE w.id = watchlist_items.watchlist_id AND w.user_id = auth.uid())
  );
