-- Migration: 013_employees_and_performance.sql
-- Description: Provision Employee Management, Profiles, Activities, Evaluation System, and ID Cards (Phase 11)

-- 1. Employees Table
CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_code VARCHAR(50) NOT NULL UNIQUE,
  user_id INT NULL UNIQUE,
  property_id INT NULL,
  manager_id INT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(191) NOT NULL UNIQUE,
  phone VARCHAR(50) NOT NULL,
  photo_url VARCHAR(255) NULL,
  department ENUM('FRONT_DESK', 'HOUSEKEEPING', 'MAINTENANCE', 'FINANCE', 'SECURITY', 'MANAGEMENT', 'OPERATIONS', 'EXECUTIVE', 'OTHER') NOT NULL DEFAULT 'OPERATIONS',
  job_title VARCHAR(100) NOT NULL,
  employment_type ENUM('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN') NOT NULL DEFAULT 'FULL_TIME',
  employment_status ENUM('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED') NOT NULL DEFAULT 'ACTIVE',
  hire_date DATE NOT NULL,
  termination_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL,
  FOREIGN KEY (manager_id) REFERENCES employees(id) ON DELETE SET NULL,
  INDEX idx_emp_code (employee_code),
  INDEX idx_emp_user (user_id),
  INDEX idx_emp_property (property_id),
  INDEX idx_emp_status (employment_status),
  INDEX idx_emp_dept (department)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Employee Profiles Table (Personal info, address, emergency contact, qualifications)
CREATE TABLE IF NOT EXISTS employee_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL UNIQUE,
  date_of_birth DATE NULL,
  gender ENUM('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY') NULL,
  address TEXT NULL,
  city VARCHAR(100) NULL,
  state VARCHAR(100) NULL,
  postal_code VARCHAR(20) NULL,
  emergency_contact_name VARCHAR(150) NULL,
  emergency_contact_phone VARCHAR(50) NULL,
  emergency_contact_relation VARCHAR(50) NULL,
  qualifications TEXT NULL,
  skills TEXT NULL,
  bio_notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  INDEX idx_prof_emp (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Employee Activities Ledger Table
CREATE TABLE IF NOT EXISTS employee_activities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  property_id INT NULL,
  activity_type VARCHAR(100) NOT NULL,
  activity_category VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
  description VARCHAR(255) NOT NULL,
  related_entity_type VARCHAR(50) NULL,
  related_entity_id VARCHAR(50) NULL,
  status ENUM('SUCCESS', 'FAILED', 'PENDING', 'FLAGGED') NOT NULL DEFAULT 'SUCCESS',
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL,
  INDEX idx_act_emp (employee_id),
  INDEX idx_act_prop (property_id),
  INDEX idx_act_type (activity_type),
  INDEX idx_act_category (activity_category),
  INDEX idx_act_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Employee Evaluation Criteria (Configurable Templates)
CREATE TABLE IF NOT EXISTS employee_evaluation_criteria (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
  description VARCHAR(255) NULL,
  weight DECIMAL(5, 2) NOT NULL DEFAULT 1.00,
  max_score INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_crit_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Employee Evaluations (Evaluation Header & Workflow)
CREATE TABLE IF NOT EXISTS employee_evaluations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  evaluation_code VARCHAR(50) NOT NULL UNIQUE,
  employee_id INT NOT NULL,
  evaluator_id INT NOT NULL,
  property_id INT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  evaluation_period_label VARCHAR(100) NOT NULL,
  status ENUM('DRAFT', 'SUBMITTED', 'FINALIZED') NOT NULL DEFAULT 'DRAFT',
  system_metrics_snapshot JSON NULL,
  manager_overall_score DECIMAL(5, 2) NULL,
  strengths TEXT NULL,
  areas_for_improvement TEXT NULL,
  evaluator_comments TEXT NULL,
  employee_acknowledgement_comments TEXT NULL,
  acknowledged_at TIMESTAMP NULL,
  submitted_at TIMESTAMP NULL,
  finalized_by_id INT NULL,
  finalized_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (evaluator_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL,
  FOREIGN KEY (finalized_by_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_eval_emp (employee_id),
  INDEX idx_eval_status (status),
  INDEX idx_eval_evaluator (evaluator_id),
  INDEX idx_eval_period (period_start, period_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Employee Evaluation Scores (Dimension scores)
CREATE TABLE IF NOT EXISTS employee_evaluation_scores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  evaluation_id INT NOT NULL,
  criterion_id INT NOT NULL,
  score DECIMAL(5, 2) NOT NULL,
  comments TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (evaluation_id) REFERENCES employee_evaluations(id) ON DELETE CASCADE,
  FOREIGN KEY (criterion_id) REFERENCES employee_evaluation_criteria(id) ON DELETE CASCADE,
  UNIQUE KEY uq_eval_criterion (evaluation_id, criterion_id),
  INDEX idx_score_eval (evaluation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Employee ID Cards Table (Lifecycle & QR verification)
CREATE TABLE IF NOT EXISTS employee_id_cards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  card_number VARCHAR(50) NOT NULL UNIQUE,
  employee_id INT NOT NULL,
  property_id INT NULL,
  status ENUM('NOT_GENERATED', 'ACTIVE', 'EXPIRED', 'REVOKED', 'REISSUED') NOT NULL DEFAULT 'ACTIVE',
  verification_token VARCHAR(100) NOT NULL UNIQUE,
  issued_at DATE NOT NULL,
  expires_at DATE NOT NULL,
  generated_by_id INT NOT NULL,
  revoked_by_id INT NULL,
  revoked_at TIMESTAMP NULL,
  revocation_reason VARCHAR(255) NULL,
  reissued_from_id INT NULL,
  pdf_path VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL,
  FOREIGN KEY (generated_by_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (revoked_by_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (reissued_from_id) REFERENCES employee_id_cards(id) ON DELETE SET NULL,
  INDEX idx_card_emp (employee_id),
  INDEX idx_card_status (status),
  INDEX idx_card_token (verification_token),
  INDEX idx_card_number (card_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Employee Documents
CREATE TABLE IF NOT EXISTS employee_documents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  employee_id INT NOT NULL,
  title VARCHAR(150) NOT NULL,
  document_type ENUM('CONTRACT', 'RESUME', 'ID_PROOF', 'CERTIFICATION', 'WARNING_LETTER', 'OTHER') NOT NULL DEFAULT 'OTHER',
  file_url VARCHAR(255) NOT NULL,
  uploaded_by_id INT NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_doc_emp (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Seed Phase 11 Capabilities
INSERT IGNORE INTO capabilities (name, description, category, is_enabled, restriction_level) VALUES
('EMPLOYEE_VIEW', 'View employee directory, profiles and summaries', 'EMPLOYEES', TRUE, 'NONE'),
('EMPLOYEE_CREATE', 'Register and create new employee records', 'EMPLOYEES', TRUE, 'NONE'),
('EMPLOYEE_UPDATE', 'Update employee profiles, department and positions', 'EMPLOYEES', TRUE, 'NONE'),
('EMPLOYEE_DEACTIVATE', 'Deactivate or suspend employees and adjust employment status', 'EMPLOYEES', TRUE, 'NONE'),
('EMPLOYEE_ACTIVITY_VIEW', 'View employee operational activity ledgers', 'EMPLOYEES', TRUE, 'NONE'),
('EMPLOYEE_EVALUATION_VIEW', 'View manager evaluations and score history', 'EMPLOYEES', TRUE, 'NONE'),
('EMPLOYEE_EVALUATION_CREATE', 'Initiate and draft employee performance evaluations', 'EMPLOYEES', TRUE, 'NONE'),
('EMPLOYEE_EVALUATION_UPDATE', 'Update and submit draft performance evaluations', 'EMPLOYEES', TRUE, 'NONE'),
('EMPLOYEE_EVALUATION_FINALIZE', 'Authorize and finalize official employee evaluations', 'EMPLOYEES', TRUE, 'NONE'),
('EMPLOYEE_ID_CARD_VIEW', 'View and preview employee ID cards', 'EMPLOYEES', TRUE, 'NONE'),
('EMPLOYEE_ID_CARD_GENERATE', 'Generate and issue official employee ID cards', 'EMPLOYEES', TRUE, 'NONE'),
('EMPLOYEE_ID_CARD_REVOKE', 'Revoke or cancel active employee ID cards', 'EMPLOYEES', TRUE, 'NONE');

-- 10. Seed Baseline Evaluation Criteria (9 Dimensions)
INSERT IGNORE INTO employee_evaluation_criteria (id, code, name, category, description, weight, max_score, display_order) VALUES
(1, 'ATTENDANCE', 'Attendance', 'CORE', 'Shift consistency and adherence to work schedule', 1.00, 100, 1),
(2, 'PUNCTUALITY', 'Punctuality', 'CORE', 'On-time arrival and adherence to operational shifts', 1.00, 100, 2),
(3, 'PRODUCTIVITY', 'Productivity', 'OPERATIONAL', 'Volume and speed of tasks and work completed', 1.20, 100, 3),
(4, 'QUALITY_OF_WORK', 'Quality of Work', 'OPERATIONAL', 'Thoroughness, precision, and adherence to BFA quality standards', 1.20, 100, 4),
(5, 'CUSTOMER_SERVICE', 'Customer Service', 'GUEST_RELATIONS', 'Guest responsiveness, courtesy, and hospitality resolution', 1.20, 100, 5),
(6, 'TEAMWORK', 'Teamwork', 'INTERPERSONAL', 'Cooperation with colleagues and cross-departmental agility', 1.00, 100, 6),
(7, 'COMMUNICATION', 'Communication', 'INTERPERSONAL', 'Clarity and speed of verbal and written reporting', 1.00, 100, 7),
(8, 'COMPLIANCE', 'Compliance', 'GOVERNANCE', 'Strict compliance with company policies, safety and SOPs', 1.00, 100, 8),
(9, 'INITIATIVE', 'Initiative', 'INNOVATION', 'Proactive problem solving and taking ownership of guest needs', 1.00, 100, 9);

-- 11. Seed Baseline Employees from Existing Users
INSERT IGNORE INTO employees (id, employee_code, user_id, property_id, manager_id, first_name, last_name, full_name, email, phone, department, job_title, employment_type, employment_status, hire_date) VALUES
(1, 'BFA-EMP-001', 2, NULL, NULL, 'Sarah', 'Jenkins', 'Sarah Jenkins', 'admin@bfa.com', '+234 802 111 2233', 'MANAGEMENT', 'General Operations Director', 'FULL_TIME', 'ACTIVE', '2025-01-15'),
(2, 'BFA-EMP-002', 3, NULL, 1, 'Marcus', 'Vance', 'Marcus Vance', 'manager@bfa.com', '+234 803 222 3344', 'MANAGEMENT', 'Apartment Portfolio Manager', 'FULL_TIME', 'ACTIVE', '2025-03-01'),
(3, 'BFA-EMP-003', 4, 1, 2, 'Elena', 'Ramos', 'Elena Ramos', 'receptionist@bfa.com', '+234 805 333 4455', 'FRONT_DESK', 'Front Desk Receptionist', 'FULL_TIME', 'ACTIVE', '2025-06-10'),
(4, 'BFA-EMP-004', 5, 1, 2, 'David', 'Kalu', 'David Kalu', 'staff@bfa.com', '+234 807 444 5566', 'MAINTENANCE', 'Facility Maintenance Technician', 'FULL_TIME', 'ACTIVE', '2025-07-20');

-- 12. Seed Baseline Profiles
INSERT IGNORE INTO employee_profiles (employee_id, date_of_birth, gender, address, city, state, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, qualifications, skills) VALUES
(1, '1988-04-12', 'FEMALE', '14 Victoria Island Way', 'Lagos', 'Lagos State', 'Robert Jenkins', '+234 802 999 0001', 'Spouse', 'MSc Hospitality Management, PMP Certified', 'Strategic Planning, Operations Leadership, Financial Auditing'),
(2, '1990-09-25', 'MALE', '22 Lekki Phase 1', 'Lagos', 'Lagos State', 'Clara Vance', '+234 803 999 0002', 'Sister', 'BSc Business Administration', 'Apartment Operations, Staff Supervision, Conflict Resolution'),
(3, '1995-11-04', 'FEMALE', '8 Ikoyi Crescent', 'Lagos', 'Lagos State', 'Maria Ramos', '+234 805 999 0003', 'Mother', 'BA Communications', 'Guest Relations, Multilingual, Front Office PMS'),
(4, '1992-02-18', 'MALE', '5 Ikeja GRA', 'Lagos', 'Lagos State', 'Ngozi Kalu', '+234 807 999 0004', 'Wife', 'Trade Diploma in Electrical & Plumbing Engineering', 'HVAC Repair, Electrical Maintenance, Plumbing, Carpentry');
