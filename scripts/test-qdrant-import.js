try {
    console.log('Importing qdrantService...');
    const qdrantService = require('../utils/qdrantService');
    console.log('qdrantService imported successfully');
} catch (error) {
    console.error('Error importing qdrantService:', error);
}
