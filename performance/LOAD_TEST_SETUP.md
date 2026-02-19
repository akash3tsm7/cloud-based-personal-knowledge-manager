# How to Fix Load Test Authentication Issue

## Problem
The load tests are failing with "Failed to get auth token" because they need a test user account.

## Solution

### Option 1: Automatic Setup (Recommended)

Run the test user setup script:

```bash
npm run setup-test-user
```

This will:
1. Try to login with the test user
2. If it doesn't exist, create it automatically
3. Verify the credentials work

### Option 2: Manual Setup

If the automatic setup fails, manually create the test user:

1. **Open your browser** and go to: `http://localhost:5000/api/auth/register-page`

2. **Register with these exact credentials:**
   - Username: `testuser`
   - Email: `testuser@example.com`
   - Password: `TestPassword123!`

3. **Verify** by logging in at: `http://localhost:5000/api/auth/login-page`

### Option 3: Use MongoDB Directly

If you have MongoDB access:

```javascript
// Connect to MongoDB and create user
use your_database_name;

db.users.insertOne({
    username: "testuser",
    email: "testuser@example.com",
    password: "$2b$10$...", // You'll need to hash the password
    createdAt: new Date()
});
```

## After Setup

Once the test user exists, run the load tests:

```bash
npm run load-test
```

## Troubleshooting

### Error: "Server is not running"
**Solution:** Make sure your server is running first:
```bash
npm start
```

### Error: "User already exists"
**Solution:** The user exists but with a different password. Either:
1. Delete the user from MongoDB and retry
2. Update the password in the load test files to match

### Error: "Request failed with status code 400"
**Solution:** Check server logs for validation errors. Common issues:
- Password doesn't meet requirements (min 8 chars, uppercase, number, special char)
- Username already taken
- Email format invalid

## Test User Credentials

The load tests use these credentials:
- **Username:** `testuser`
- **Email:** `testuser@example.com`
- **Password:** `TestPassword123!`

If you want to use different credentials, update them in:
- `performance/load-tests/rag-load-test.js`
- `performance/load-tests/setup-test-user.js`

## Verification

To verify the test user works:

```bash
# Run the setup script
npm run setup-test-user

# You should see:
# ✅ Test user already exists and login successful!
# OR
# ✅ Test user registered successfully!
# ✅ Login successful!
```

Then run load tests:

```bash
npm run load-test
```

You should see the load tests running without authentication errors.

---

**Note:** The test user is only needed for load tests. Benchmarks (embedding, Qdrant, capacity) don't require authentication and will work without it.
