const { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');

const AWS_REGION = process.env.AWS_REGION || 'ap-southeast-2';
const QUEUE_URL = process.env.QUEUE_URL;

const sqsClient = new SQSClient({ region: AWS_REGION });

// Send a message to the queue
async function sendMessage(messageBody) {
    const command = new SendMessageCommand({
        QueueUrl: QUEUE_URL,
        MessageBody: JSON.stringify(messageBody)
    });
    
    return await sqsClient.send(command);
}

// Receive messages from the queue
async function receiveMessages(maxMessages = 1, waitTimeSeconds = 20) {
    const command = new ReceiveMessageCommand({
        QueueUrl: QUEUE_URL,
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: waitTimeSeconds, // Long polling
        VisibilityTimeout: 900 // 15 minutes
    });
    
    const response = await sqsClient.send(command);
    return response.Messages || [];
}

// Delete a message after processing
async function deleteMessage(receiptHandle) {
    const command = new DeleteMessageCommand({
        QueueUrl: QUEUE_URL,
        ReceiptHandle: receiptHandle
    });
    
    return await sqsClient.send(command);
}

module.exports = {
    sendMessage,
    receiveMessages,
    deleteMessage,
    getQueueUrl: () => QUEUE_URL
};