const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-southeast-2'
});

const docClient = DynamoDBDocumentClient.from(client);

const VIDEOS_TABLE = process.env.VIDEOS_TABLE || 'CAB432-Videos-n11676795';
const JOBS_TABLE = process.env.JOBS_TABLE || 'CAB432-ProcessingJobs-n11676795';

// Export both old and new formats for compatibility
function getDocClient() {
    return docClient;
}

function getTablesNames() {
    return {
        videosTable: VIDEOS_TABLE,
        jobsTable: JOBS_TABLE
    };
}

module.exports = { 
    docClient,          // Old export
    VIDEOS_TABLE,       // Old export
    JOBS_TABLE,         // Old export
    getDocClient,       // New export (function)
    getTablesNames      // New export (function)
};