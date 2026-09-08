-- Why a card left the active board (FR-123). Written when an issue stops
-- matching the query; read by slice 4's archive view.
ALTER TABLE cards ADD COLUMN archived_reason text;
