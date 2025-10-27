require('dotenv').config();
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const { getDocClient, getTablesNames } = require('./utils/dynamoClient');
const { ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const AWS_REGION = process.env.AWS_REGION || 'ap-southeast-2';
const ssmClient = new SSMClient({ region: AWS_REGION });

async function getParameter(name) {
    const command = new GetParameterCommand({ Name: name });
    const response = await ssmClient.send(command);
    return response.Parameter.Value;
}

async function loadConfig() {
    console.log('Loading cleanup configuration...');
    const jobsTable = await getParameter('/n11676795/video-processor/jobs-table');
    process.env.JOBS_TABLE = jobsTable;
    console.log(`Jobs Table: ${jobsTable}`);
}

async function cleanupOldJobs() {
    const docClient = getDocClient();
    const JOBS_TABLE = getTablesNames().JOBS_TABLE;
    
    // Calculate date 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoffDate = sevenDaysAgo.toISOString();
    
    console.log(`Looking for failed jobs older than ${cutoffDate}...`);
    
    // Scan for old failed jobs
    const scanResult = await docClient.send(new ScanCommand({
        TableName: JOBS_TABLE,
        FilterExpression: '#status = :failed AND #failedAt < :cutoff',
        ExpressionAttributeNames: {
            '#status': 'status',
            '#failedAt': 'failedAt'
        },
        ExpressionAttributeValues: {
            ':failed': 'failed',
            ':cutoff': cutoffDate
        }
    }));
    
    const oldJobs = scanResult.Items || [];
    console.log(`Found ${oldJobs.length} old failed jobs to clean up`);
    
    // Delete old jobs
    let deletedCount = 0;
    for (const job of oldJobs) {
        try {
            await docClient.send(new DeleteCommand({
                TableName: JOBS_TABLE,
                Key: { jobId: job.jobId }
            }));
            deletedCount++;
            console.log(`Deleted job ${job.jobId}`);
        } catch (error) {
            console.error(`Failed to delete job ${job.jobId}:`, error.message);
        }
    }
    
    console.log(`Cleanup complete. Deleted ${deletedCount} old jobs.`);
    return deletedCount;
}

async function main() {
    try {
        await loadConfig();
        const deletedCount = await cleanupOldJobs();
        console.log(`✓ Cleanup task finished successfully. Removed ${deletedCount} jobs.`);
        process.exit(0);
    } catch (error) {
        console.error('✗ Cleanup task failed:', error);
        process.exit(1);
    }
}

main();