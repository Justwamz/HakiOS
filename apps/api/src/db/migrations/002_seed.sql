-- Default matter type codes
INSERT INTO matter_type_codes (code, label) VALUES
  ('LIT',  'Litigation'),
  ('CORP', 'Corporate / Commercial'),
  ('ADV',  'Advisory'),
  ('CONV', 'Conveyancing'),
  ('EMP',  'Employment'),
  ('FAM',  'Family')
ON CONFLICT (code) DO NOTHING;

-- Default system settings
INSERT INTO settings (key, value) VALUES
  ('case_number',           '{"firmPrefix":"LF","includeTypeCode":true,"includeYear":true,"sequenceDigits":5,"separator":"/"}'),
  ('firm_profile',          '{"firmName":"","address":"","phone":"","email":""}'),
  ('email_delivery_mode',   '"realtime"'),
  ('digest_send_time',      '"07:00"'),
  ('escalation_threshold_hours', '24')
ON CONFLICT (key) DO NOTHING;

-- Default reminder schedules (days before event)
INSERT INTO reminder_schedules (event_type, days_before) VALUES
  ('court_hearing', 30), ('court_hearing', 14), ('court_hearing', 7),
  ('court_hearing', 3),  ('court_hearing', 1),
  ('filing_deadline', 30), ('filing_deadline', 14), ('filing_deadline', 7),
  ('filing_deadline', 3),  ('filing_deadline', 1),
  ('submission_deadline', 14), ('submission_deadline', 7), ('submission_deadline', 3),
  ('mention', 7), ('mention', 3), ('mention', 1),
  ('client_meeting', 3), ('client_meeting', 1),
  ('internal_review', 3), ('internal_review', 1)
ON CONFLICT (event_type, days_before) DO NOTHING;
