const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const ssmClient = new SSMClient({ region: 'ap-southeast-2' });
const secretsClient = new SecretsManagerClient({ region: 'ap-southeast-2' });

const configCache = {};

async function getParameter(name) {
    if (configCache[name]) {
        return configCache[name];
    }

    const command = new GetParameterCommand({ Name: name });
    const response = await ssmClient.send(command);
    configCache[name] = response.Parameter.Value;
    return configCache[name];
}

async function getSecret(name) {
    if (configCache[name]) {
        return configCache[name];
    }

    const command = new GetSecretValueCommand({ SecretId: name });
    const response = await secretsClient.send(command);
    configCache[name] = response.SecretString;
    return configCache[name];
}

async function loadConfig() {
    try {
        const config = {
            s3Bucket: await getParameter('/n11676795/video-processor/s3-bucket'),
            videosTable: await getParameter('/n11676795/video-processor/videos-table'),
            jobsTable: await getParameter('/n11676795/video-processor/jobs-table'),
            cognitoUserPoolId: await getParameter('/n11676795/video-processor/cognito-user-pool-id'),
            cognitoClientId: await getParameter('/n11676795/video-processor/cognito-client-id'),
            cognitoClientSecret: await getSecret('/n11676795/video-processor/cognito-client-secret')
        };
        
        console.log('Configuration loaded from AWS Parameter Store and Secrets Manager');
        return config;
    } catch (error) {
        console.error('Failed to load configuration:', error);
        throw error;
    }
}

module.exports = { loadConfig, getParameter, getSecret };