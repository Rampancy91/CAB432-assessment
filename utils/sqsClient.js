const { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');

const AWS_REGION = process.env.AWS_REGION || 'ap-southeast-2';

// Create SQS client with explicit region
const sqsClient = new SQSClient({
    region: AWS_REGION,
});

// Get queue URL dynamically (don't cache it at module load time)
function getQueueUrl() {
    const queueUrl = process.env.QUEUE_URL;
    if (!queueUrl) {
        throw new Error('QUEUE_URL environment variable is not set');
    }
    return queueUrl;
}

// Send a message to the queue
async function sendMessage(messageBody) {
    const command = new SendMessageCommand({
        QueueUrl: getQueueUrl(),
        MessageBody: JSON.stringify(messageBody)
    });
    
    return await sqsClient.send(command);
}

// Receive messages from the queue
async function receiveMessages(maxMessages = 1, waitTimeSeconds = 20) {
    const command = new ReceiveMessageCommand({
        QueueUrl: getQueueUrl(),
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: waitTimeSeconds,
        VisibilityTimeout: 900
    });
    
    const response = await sqsClient.send(command);
    return response.Messages || [];
}

// Delete a message after processing
async function deleteMessage(receiptHandle) {
    const command = new DeleteMessageCommand({
        QueueUrl: getQueueUrl(),
        ReceiptHandle: receiptHandle
    });
    
    return await sqsClient.send(command);
}

module.exports = {
    sendMessage,
    receiveMessages,
    deleteMessage,
    getQueueUrl
};