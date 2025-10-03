const { 
    CognitoUserPool, 
    CognitoUser, 
    AuthenticationDetails,
    CognitoUserAttribute 
} = require('amazon-cognito-identity-js');

const poolData = {
    UserPoolId: process.env.COGNITO_USER_POOL_ID || 'ap-southeast-2_RxwUU6SDz',
    ClientId: process.env.COGNITO_CLIENT_ID || '33m60gvsfuebp2elkat3hp5dol'
};

const userPool = new CognitoUserPool(poolData);

// Register new user
function registerUser(username, email, password) {
    return new Promise((resolve, reject) => {
        const attributeList = [
            new CognitoUserAttribute({
                Name: 'email',
                Value: email
            })
        ];

        userPool.signUp(username, password, attributeList, null, (err, result) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(result.user);
        });
    });
}

// Confirm user registration with code from email
function confirmRegistration(username, code) {
    return new Promise((resolve, reject) => {
        const cognitoUser = new CognitoUser({
            Username: username,
            Pool: userPool
        });

        cognitoUser.confirmRegistration(code, true, (err, result) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(result);
        });
    });
}

// Login user
function authenticateUser(username, password) {
    return new Promise((resolve, reject) => {
        const authenticationDetails = new AuthenticationDetails({
            Username: username,
            Password: password
        });

        const cognitoUser = new CognitoUser({
            Username: username,
            Pool: userPool
        });

        cognitoUser.authenticateUser(authenticationDetails, {
            onSuccess: (result) => {
                resolve({
                    accessToken: result.getAccessToken().getJwtToken(),
                    idToken: result.getIdToken().getJwtToken(),
                    refreshToken: result.getRefreshToken().getToken()
                });
            },
            onFailure: (err) => {
                reject(err);
            }
        });
    });
}

module.exports = {
    registerUser,
    confirmRegistration,
    authenticateUser,
    userPool
};