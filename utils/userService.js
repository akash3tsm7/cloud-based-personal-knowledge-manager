const fs = require('fs');
const qdrantService = require('./qdrantService');

/**
 * User Service
 * Handles user-related operations including cascade deletion
 */

/**
 * Delete user and all associated data (files, embeddings, uploads)
 * @param {Object} user - User document from MongoDB
 * @returns {Promise<Object>} - Deletion results
 */
async function deleteUserAndData(user) {
    try {
        console.log(`🗑️  Starting cascade delete for user: ${user.email} (${user._id})`);

        const File = require('../models/File');

        // Find all files belonging to this user
        const userFiles = await File.find({ userId: user._id });

        console.log(`Found ${userFiles.length} files to delete`);

        const results = {
            filesDeleted: 0,
            embeddingsDeleted: 0,
            physicalFilesDeleted: 0,
            errors: []
        };

        // Delete each file (embeddings + physical file + DB record)
        for (const file of userFiles) {
            try {
                // 1. Delete embeddings from Qdrant
                if (file.qdrantIds && file.qdrantIds.length > 0) {
                    try {
                        console.log(`  Deleting ${file.qdrantIds.length} embeddings from Qdrant for: ${file.fileName}`);
                        await qdrantService.deleteFileEmbeddings(file._id.toString());
                        results.embeddingsDeleted += file.qdrantIds.length;
                        console.log(`  ✓ Deleted embeddings for: ${file.fileName}`);
                    } catch (qdrantError) {
                        console.error(`  ✗ Qdrant deletion error for ${file.fileName}:`, qdrantError.message);
                        results.errors.push(`Qdrant: ${file.fileName} - ${qdrantError.message}`);
                    }
                }

                // 2. Delete physical file from disk
                if (file.fileUrl && fs.existsSync(file.fileUrl)) {
                    try {
                        fs.unlinkSync(file.fileUrl);
                        results.physicalFilesDeleted++;
                        console.log(`  ✓ Deleted physical file: ${file.fileName}`);
                    } catch (fsError) {
                        console.error(`  ✗ File system error for ${file.fileName}:`, fsError.message);
                        results.errors.push(`FS: ${file.fileName} - ${fsError.message}`);
                    }
                }

                // 3. Delete from MongoDB
                await File.deleteOne({ _id: file._id });
                results.filesDeleted++;
                console.log(`  ✓ Deleted DB record: ${file.fileName}`);

            } catch (fileError) {
                console.error(`  ✗ Error deleting file ${file.fileName}:`, fileError.message);
                results.errors.push(`File: ${file.fileName} - ${fileError.message}`);
            }
        }

        // 4. Delete user from database
        const User = require('../models/User');
        await User.deleteOne({ _id: user._id });
        console.log(`✓ Deleted user: ${user.email}`);

        console.log(`✓ Cascade delete completed for user: ${user.email}`);
        console.log(`  Files deleted: ${results.filesDeleted}`);
        console.log(`  Embeddings deleted: ${results.embeddingsDeleted}`);
        console.log(`  Physical files deleted: ${results.physicalFilesDeleted}`);

        if (results.errors.length > 0) {
            console.log(`  Errors encountered: ${results.errors.length}`);
        }

        return {
            success: true,
            ...results
        };

    } catch (error) {
        console.error('Cascade delete error:', error);
        throw error;
    }
}

module.exports = {
    deleteUserAndData
};