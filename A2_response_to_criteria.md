Assignment 2 - Cloud Services Exercises - Response to Criteria
================================================

Instructions
------------------------------------------------
- Keep this file named A2_response_to_criteria.md, do not change the name
- Upload this file along with your code in the root directory of your project
- Upload this file in the current Markdown format (.md extension)
- Do not delete or rearrange sections.  If you did not attempt a criterion, leave it blank
- Text inside [ ] like [eg. S3 ] are examples and should be removed


Overview
------------------------------------------------

- **Name:** Nathan Turner
- **Student number:** n100200300
- **Partner name (if applicable):** N/A
- **Application name:** Video Processor
- **Two line description:** Simple video processor implemented using ffmpeg.
- **EC2 instance name or ID:** i-06d138b0335882e7d

------------------------------------------------

### Core - First data persistence service

- **AWS service name:** S3
- **What data is being stored?:** Video files
- **Why is this service suited to this data?:** Scalability, suitability for large file size, options for partial download
- **Why is are the other services used not suitable for this data?:** Missing one or more of the above criteria
- **Bucket/instance/table name:** cab432-video-processor-n11676795
- **Video timestamp:** 0:22
- **Relevant files:** video.js, s3Client.js
    -

### Core - Second data persistence service

- **AWS service name:**  DynamoDB
- **What data is being stored?:** Video meta data 
- **Why is this service suited to this data?:** Ideal for tabulated data without using SQL
- **Why is are the other services used not suitable for this data?:** SQL knowledge required
- **Bucket/instance/table name:** CAB432-Videos-n11676795, 
CAB432-ProcessingJobs-n11676795
- **Video timestamp:** 0:39
- **Relevant files:** dynaomClient.js
    -

### Third data service

- **AWS service name:**  [eg. RDS]
- **What data is being stored?:** [eg video metadata]
- **Why is this service suited to this data?:** [eg. ]
- **Why is are the other services used not suitable for this data?:** [eg. Advanced video search requires complex querries which are not available on S3 and inefficient on DynamoDB]
- **Bucket/instance/table name:**
- **Video timestamp:**
- **Relevant files:**
    -

### S3 Pre-signed URLs

- **S3 Bucket names:** cab432-video-processor-n11676795
- **Video timestamp:**  1:14
- **Relevant files:** s3Client.js
    -

### In-memory cache

- **ElastiCache instance name:**
- **What data is being cached?:** [eg. Thumbnails from YouTube videos obatined from external API]
- **Why is this data likely to be accessed frequently?:** [ eg. Thumbnails from popular YouTube videos are likely to be shown to multiple users ]
- **Video timestamp:**
- **Relevant files:**
    -

### Core - Statelessness

- **What data is stored within your application that is not stored in cloud data services?:** Files undergoing transcoding/processing are create in temporary files
- **Why is this data not considered persistent state?:** Metadata of processing enables recreation
- **How does your application ensure data consistency if the app suddenly stops?:** DynamoDB data for processing jobs
- **Relevant files:** dynamoClient.js
    -

### Graceful handling of persistent connections

- **Type of persistent connection and use:** [eg. server-side-events for progress reporting]
- **Method for handling lost connections:** [eg. client responds to lost connection by reconnecting and indicating loss of connection to user until connection is re-established ]
- **Relevant files:**
    -


### Core - Authentication with Cognito

- **User pool name:** User pool - p6o5h3 
- **How are authentication tokens handled by the client?:** 
- **Video timestamp:** 1:46
- **Relevant files:**
    -

### Cognito multi-factor authentication

- **What factors are used for authentication:** [eg. password, SMS code]
- **Video timestamp:**
- **Relevant files:**
    -

### Cognito federated identities

- **Identity providers used:**
- **Video timestamp:**
- **Relevant files:**
    -

### Cognito groups

- **How are groups used to set permissions?:** [eg. 'admin' users can delete and ban other users]
- **Video timestamp:**
- **Relevant files:**
    -

### Core - DNS with Route53

- **Subdomain**:  http://11676795.cab432.com:3000/
- **Video timestamp:**

### Parameter store

- **Parameter names:** 
/n11676795/video-processor/cognito-client-id, /n11676795/video-processor/cognito-user-pool-id, 
/n11676795/video-processor/jobs-table, 
/n11676795/video-processor/s3-bucket, /n11676795/video-processor/videos-table
- **Video timestamp:** 2:54
- **Relevant files:** cognitoAuth.js, awsConfig.js
    -

### Secrets manager

- **Secrets names:** n11676795/video-processor/client-secret
- **Video timestamp:** 
- **Relevant files:** cognitoAuth.js, awsConfig.js
    -

### Infrastructure as code

- **Technology used:**
- **Services deployed:**
- **Video timestamp:**
- **Relevant files:**
    -

### Other (with prior approval only)

- **Description:**
- **Video timestamp:**
- **Relevant files:**
    -

### Other (with prior permission only)

- **Description:**
- **Video timestamp:**
- **Relevant files:**
    -
