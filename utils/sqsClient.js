const { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');

const AWS_REGION = process.env.AWS_REGION || 'ap-southeast-2';
let QUEUE_URL = process.env.QUEUE_URL;

// Create SQS client with explicit region
const sqsClient = new SQSClient({
    region: AWS_REGION,
});

// Send a message to the queue
async function sendMessage(messageBody) {
    if (!QUEUE_URL) {
        throw new Error('QUEUE_URL environment variable is not set');
    }
    
    const command = new SendMessageCommand({
        QueueUrl: QUEUE_URL,
        MessageBody: JSON.stringify(messageBody)
    });
    
    return await sqsClient.send(command);
}

// Receive messages from the queue
async function receiveMessages(maxMessages = 1, waitTimeSeconds = 20) {
    if (!QUEUE_URL) {
        throw new Error('QUEUE_URL environment variable is not set');
    }
    
    const command = new ReceiveMessageCommand({
        QueueUrl: QUEUE_URL,
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: waitTimeSeconds,
        VisibilityTimeout: 900
    });
    
    const response = await sqsClient.send(command);
    return response.Messages || [];
}

// Delete a message after processing
async function deleteMessage(receiptHandle) {
    if (!QUEUE_URL) {
        throw new Error('QUEUE_URL environment variable is not set');
    }
    
    const command = new DeleteMessageCommand({
        QueueUrl: QUEUE_URL,
        ReceiptHandle: receiptHandle
    });
    
    return await sqsClient.send(command);
}

// Allow updating the queue URL after initialization
function setQueueUrl(url) {
    QUEUE_URL = url;
}

module.exports = {
    sendMessage,
    receiveMessages,
    deleteMessage,
    getQueueUrl: () => QUEUE_URL,
    setQueueUrl
};