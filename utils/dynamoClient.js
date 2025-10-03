const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ 
    region: process.env.AWS_REGION || 'ap-southeast-2'
});

const docClient = DynamoDBDocumentClient.from(client);

const VIDEOS_TABLE = process.env.VIDEOS_TABLE || 'CAB432-Videos-n11676795';
const JOBS_TABLE = process.env.JOBS_TABLE || 'CAB432-ProcessingJobs-n11676795';

module.exports = { docClient, VIDEOS_TABLE, JOBS_TABLE };