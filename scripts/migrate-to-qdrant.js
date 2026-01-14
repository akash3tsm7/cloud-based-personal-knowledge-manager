require('dotenv').config();
const mongoose = require('mongoose');
const File = require('./models/File');
const qdrantService = require('./utils/qdrantService');
const { generateChunkEmbeddings } = require('./utils/embeddingService');

/**
 * Migration script to move existing embeddings from MongoDB to Qdrant
 * This script will:
 * 1. Find all files with chunk embeddings in MongoDB
 * 2. Store embeddings in Qdrant
 * 3. Remove embeddings from MongoDB chunks
 * 4. Update files with Qdrant point IDs
 */

async function migrateToQdrant() {
    console.log('=== Starting Migration to Qdrant ===\n');

    try {
        // Connect to MongoDB
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✓ Connected to MongoDB\n');

        // Check Qdrant connection
        console.log('Checking Qdrant connection...');
        const isConnected = await qdrantService.checkConnection();
        if (!isConnected) {
            throw new Error('Failed to connect to Qdrant. Make sure it is running.');
        }
        console.log('✓ Connected to Qdrant\n');

        // Initialize Qdrant collection
        console.log('Initializing Qdrant collection...');
        await qdrantService.initializeCollection();
        console.log('✓ Collection initialized\n');

        // Find all files with chunks that have embeddings
        console.log('Finding files with embeddings...');
        const files = await File.find({
            'chunks.embedding': { $exists: true, $ne: [] }
        });

        console.log(`Found ${files.length} files with embeddings to migrate\n`);

        if (files.length === 0) {
            console.log('No files to migrate. Exiting.');
            await mongoose.disconnect();
            return;
        }

        let successCount = 0;
        let failCount = 0;

        // Migrate each file
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            console.log(`\n[${i + 1}/${files.length}] Migrating: ${file.fileName}`);

            try {
                // Filter chunks that have embeddings
                const chunksWithEmbeddings = file.chunks.filter(
                    chunk => chunk.embedding && chunk.embedding.length > 0
                );

                if (chunksWithEmbeddings.length === 0) {
                    console.log('  No valid embeddings found, skipping...');
                    continue;
                }

                console.log(`  Found ${chunksWithEmbeddings.length} chunks with embeddings`);

                // Store embeddings in Qdrant
                const qdrantIds = await qdrantService.storeChunkEmbeddings(
                    chunksWithEmbeddings,
                    file._id.toString(),
                    file.fileName
                );

                console.log(`  ✓ Stored ${qdrantIds.length} embeddings in Qdrant`);

                // Remove embeddings from chunks
                const chunksWithoutEmbeddings = file.chunks.map(chunk => {
                    const { embedding, ...chunkWithoutEmbedding } = chunk.toObject();
                    return chunkWithoutEmbedding;
                });

                // Update file in MongoDB
                file.chunks = chunksWithoutEmbeddings;
                file.qdrantIds = qdrantIds;
                await file.save();

                console.log(`  ✓ Updated MongoDB document`);
                successCount++;

            } catch (error) {
                console.error(`  ✗ Failed to migrate: ${error.message}`);
                failCount++;
            }
        }

        console.log('\n=== Migration Complete ===');
        console.log(`Successfully migrated: ${successCount} files`);
        console.log(`Failed: ${failCount} files`);

        // Show final collection stats
        const collectionInfo = await qdrantService.getCollectionInfo();
        console.log(`\nQdrant Collection Stats:`);
        console.log(`  Total points: ${collectionInfo.pointsCount}`);
        console.log(`  Total vectors: ${collectionInfo.vectorsCount}`);

        await mongoose.disconnect();
        console.log('\n✓ Migration completed successfully!');

    } catch (error) {
        console.error('\n✗ Migration failed:', error.message);
        console.error('Stack trace:', error.stack);
        await mongoose.disconnect();
        process.exit(1);
    }
}

// Run migration
migrateToQdrant();
