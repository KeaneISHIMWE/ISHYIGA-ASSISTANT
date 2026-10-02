ALTER TABLE studio_contributions
  ADD COLUMN IF NOT EXISTS encountered TEXT;
