import pkg from "@aws-sdk/lib-dynamodb";
const { DynamoDBClient, ScanCommand, DeleteCommand } = pkg;
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

// 🔧 CONFIG — update these if needed
const REGION = "ap-southeast-2";
const BUCKET = "cab432-video-processor-n11676795";
const TABLE = "CAB432-Videos-n11676795"; // <-- replace with your DynamoDB table name

const s3 = new S3Client({ region: REGION });
const db = new DynamoDBClient({ region: REGION });

async function deleteAllVideos() {
  try {
    console.log("Scanning DynamoDB table for all videos...");

    let lastEvaluatedKey = undefined;
    let totalDeleted = 0;

    do {
      const result = await db.send(
        new ScanCommand({
          TableName: TABLE,
          ExclusiveStartKey: lastEvaluatedKey,
        })
      );

      const items = result.Items || [];

      for (const video of items) {
        console.log(`🗑️  Deleting video: ${video.videoId} (${video.originalName || "no name"})`);

        // Delete original S3 object
        if (video.s3Key) {
          try {
            await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: video.s3Key }));
          } catch (s3Err) {
            console.warn(`⚠️  Failed to delete S3 object ${video.s3Key}:`, s3Err.message);
          }
        }

        // Delete processed versions, if any
        if (video.processedVersions && Array.isArray(video.processedVersions)) {
          for (const processed of video.processedVersions) {
            if (processed.s3Key) {
              try {
                await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: processed.s3Key }));
              } catch (s3Err) {
                console.warn(`⚠️  Failed to delete processed file ${processed.s3Key}:`, s3Err.message);
              }
            }
          }
        }

        // Delete DynamoDB record
        try {
          await db.send(new DeleteCommand({
            TableName: TABLE,
            Key: { videoId: video.videoId },
          }));
          totalDeleted++;
        } catch (dbErr) {
          console.warn(`⚠️  Failed to delete DynamoDB record for ${video.videoId}:`, dbErr.message);
        }
      }

      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`✅ Cleanup complete — deleted ${totalDeleted} videos total.`);
  } catch (err) {
    console.error("❌ Cleanup error:", err);
  }
}

deleteAllVideos();
