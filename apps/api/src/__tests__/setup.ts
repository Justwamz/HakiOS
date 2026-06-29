// Set required env vars before any module imports resolve
process.env['DATABASE_URL'] = process.env['DATABASE_URL'] ?? 'postgresql://localhost/hakios_test'
process.env['JWT_SECRET'] = 'test-jwt-secret-32-characters-long'
process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-32-chars-long'
process.env['APP_URL'] = 'http://localhost:5173'
