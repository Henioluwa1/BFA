-- Migration 044: Expand property_submissions status & submission_type CHECK constraints for two-stage Property/Apartment workflow

ALTER TABLE property_submissions DROP CONSTRAINT IF EXISTS property_submissions_status_check;
ALTER TABLE property_submissions ADD CONSTRAINT property_submissions_status_check CHECK (
  status IN (
    'DRAFT',
    'SUBMITTED',
    'PENDING_OWNER_APPROVAL',
    'PENDING_OPS_APPROVAL',
    'UNDER_REVIEW',
    'CHANGES_REQUESTED',
    'REJECTED',
    'APPROVED',
    'PUBLISHED',
    'UNPUBLISHED'
  )
);

ALTER TABLE property_submissions DROP CONSTRAINT IF EXISTS property_submissions_submission_type_check;
ALTER TABLE property_submissions ADD CONSTRAINT property_submissions_submission_type_check CHECK (
  submission_type IN (
    'NEW_PROPERTY',
    'NEW_APARTMENT',
    'CONTENT_UPDATE',
    'PHOTO_UPDATE',
    'PRICE_UPDATE'
  )
);
