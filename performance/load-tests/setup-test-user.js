require('dotenv').config();
const axios = require('axios');
const mongoose = require('mongoose');
const User = require('../../models/User'); // Adjust path as needed

/**
 * Setup Test User for Load Testing
 * Creates a test user account if it doesn't exist
 */

async function setupTestUser() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║      TEST USER SETUP                  ║');
    console.log('╚════════════════════════════════════════╝\n');

    const testUser = {
        name: 'Test User',
        email: 'testuser@example.com',
        password: 'TestPassword123!'
    };

    try {
        // 1. Try to login first
        console.log('1. Attempting to login with existing test user...');
        try {
            const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
                email: testUser.email,
                password: testUser.password
            });

            console.log('✅ Test user already exists and login successful!');
            console.log(`   Token: ${loginResponse.data.data.token.substring(0, 20)}...`);
            return loginResponse.data.data.token;
        } catch (loginError) {
            console.log('   Login failed or user does not exist.');
        }

        // 2. If login failed, connect to DB to ensure clean state
        console.log('\n2. Cleaning up any existing test user in database...');
        if (!process.env.MONGO_URI) {
            throw new Error('MONGO_URI not found in .env');
        }

        await mongoose.connect(process.env.MONGO_URI);
        const existingUser = await User.findOne({ email: testUser.email });

        if (existingUser) {
            console.log(`   Found existing user ${testUser.email}, deleting...`);
            await User.deleteOne({ _id: existingUser._id });
            console.log('   User deleted from database.');
        } else {
            console.log('   No existing user found in database.');
        }
        await mongoose.connection.close();

        // 3. Register fresh user via API
        console.log('\n3. Registering new test user via API...');
        const registerResponse = await axios.post('http://localhost:5000/api/auth/register', {
            name: testUser.name,
            email: testUser.email,
            password: testUser.password
        });

        console.log('✅ Test user registered successfully!');

        // 4. Login to get token
        console.log('\n4. Logging in with new user...');
        const finalLoginResponse = await axios.post('http://localhost:5000/api/auth/login', {
            email: testUser.email,
            password: testUser.password
        });

        console.log('✅ Login successful!');
        console.log(`   Token: ${finalLoginResponse.data.data.token.substring(0, 20)}...`);
        return finalLoginResponse.data.data.token;

    } catch (error) {
        console.error('\n❌ Test user setup failed');
        if (error.response) {
            console.error('API Error:', {
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data
            });
        } else if (error.request) {
            console.error('Network Error: No response received from server');
            console.error('Make sure the server is running on http://localhost:5000');
        } else {
            console.error('Error:', error.message);
        }

        // Ensure DB connection is closed
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.close();
        }

        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    setupTestUser()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = { setupTestUser };
