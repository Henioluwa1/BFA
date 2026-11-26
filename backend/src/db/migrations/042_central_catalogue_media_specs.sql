-- Migration 042 (MySQL mirror): Central Property & Apartment Media Persistence + Technical Specifications
ALTER TABLE media_assets
  ADD COLUMN file_data LONGBLOB NULL;

ALTER TABLE properties
  ADD COLUMN technical_specs JSON NULL;

ALTER TABLE apartments
  ADD COLUMN technical_specs JSON NULL;
