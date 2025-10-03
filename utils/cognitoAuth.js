const { 
    CognitoIdentityProviderClient,
    SignUpCommand,
    ConfirmSignUpCommand,
    InitiateAuthCommand
} = require('@aws-sdk/client-cognito-identity-provider');
const crypto = require('crypto');

const USER_POOL_ID = 'ap-southeast-2_PJpxeKlYZ';
const CLIENT_ID = '4v2r77jcbcajkofgd9pd1dgmnf';
const CLIENT_SECRET = '1gihno0l9ujpe56sb62c1ham8i33j92egnakugvrtt5jj7if37qs';
const REGION = 'ap-southeast-2';

const client = new CognitoIdentityProviderClient({ region: REGION });

// Generate SECRET_HASH required for client secret
function secretHash(username) {
    const hasher = crypto.createHmac('sha256', CLIENT_SECRET);
    hasher.update(`${username}${CLIENT_ID}`);
    return hasher.digest('base64');
}

// Register new user
async function registerUser(username, email, password) {
    const command = new SignUpCommand({
        ClientId: CLIENT_ID,
        SecretHash: secretHash(username),
        Username: username,
        Password: password,
        UserAttributes: [{ Name: 'email', Value: email }]
    });

    return await client.send(command);
}

// Confirm registration
async function confirmRegistration(username, code) {
    const command = new ConfirmSignUpCommand({
        ClientId: CLIENT_ID,
        SecretHash: secretHash(username),
        Username: username,
        ConfirmationCode: code
    });

    return await client.send(command);
}

// Authenticate user
async function authenticateUser(username, password) {
    const command = new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        AuthParameters: {
            USERNAME: username,
            PASSWORD: password,
            SECRET_HASH: secretHash(username)
        },
        ClientId: CLIENT_ID
    });

    const response = await client.send(command);
    return response.AuthenticationResult;
}

module.exports = {
    registerUser,
    confirmRegistration,
    authenticateUser,
    USER_POOL_ID,
    CLIENT_ID
};