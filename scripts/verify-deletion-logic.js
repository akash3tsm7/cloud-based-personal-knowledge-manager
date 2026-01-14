const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Mocks/Stubs for Qdrant if needed, but we'll try to run it with the real service if available
// or just catch the errors if Qdrant isn't running locally.

const User = require('../models/User');
const File = require('../models/File');
const { deleteUserAndData } = require('../utils/userService');

async function testDeletion() {
    console.log('🧪 Starting Deletion Verification Test...');

    try {
        // 1. Connect to MongoDB
        console.log('MongoDB URI:', process.env.MONGO_URI ? 'Defined' : 'Undefined');
        if (mongoose.connection.readyState === 0) {
            console.log('Connecting to MongoDB...');
            await mongoose.connect(process.env.MONGO_URI);
            console.log('✓ Connected to MongoDB');
        }

        // 2. Create a Test User
        const testUserEmail = `test_del_${Date.now()}@example.com`;
        const testUser = new User({
            email: testUserEmail,
            password: 'password123',
            name: 'Test Deletion User'
        });
        await testUser.save();
        console.log(`✓ Created test user: ${testUser.id}`);

        // 3. Create a Dummy Physical File
        const uploadsDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
        const dummyFilePath = path.join(uploadsDir, `test_file_${Date.now()}.txt`);
        fs.writeFileSync(dummyFilePath, 'This is a test file for deletion.');
        console.log(`✓ Created dummy physical file at: ${dummyFilePath}`);

        // 4. Create a File Record in DB
        const testFile = new File({
            userId: testUser._id,
            fileName: 'test_file.txt',
            fileType: 'text/plain',
            fileUrl: dummyFilePath,
            qdrantIds: ['dummy-qdrant-id-1', 'dummy-qdrant-id-2']
        });
        await testFile.save();
        console.log(`✓ Created test file record: ${testFile._id}`);

        // 5. Execute Deletion
        console.log('➤ Executing deleteUserAndData...');
        const result = await deleteUserAndData(testUser);
        console.log('Deletion Result:', result);

        // 6. Verify Results

        // Check User
        const userCheck = await User.findById(testUser._id);
        if (!userCheck) console.log('✓ User correctly deleted from DB');
        else console.error('✗ User still exists in DB!');

        // Check File Record
        const fileCheck = await File.findById(testFile._id);
        if (!fileCheck) console.log('✓ File record correctly deleted from DB');
        else console.error('✗ File record still exists in DB!');

        // Check Physical File
        if (!fs.existsSync(dummyFilePath)) console.log('✓ Physical file correctly deleted');
        else console.error('✗ Physical file still exists on disk!');

        // Cleanup if anything failed? 
        // If tests passed, everything is already clean.

    } catch (error) {
        console.error('Test Failed:', error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

testDeletion();
