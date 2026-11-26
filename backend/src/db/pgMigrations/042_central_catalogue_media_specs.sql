-- Migration 042: Central Property & Apartment Media Persistence + Technical Specifications
-- Stores validated image binaries in media_assets (BYTEA) for Render persistence across restarts,
-- and adds structured technical_specs JSONB to properties and apartments.

ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS file_data BYTEA;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS technical_specs JSONB DEFAULT '{}'::jsonb;

ALTER TABLE apartments
  ADD COLUMN IF NOT EXISTS technical_specs JSONB DEFAULT '{}'::jsonb;
