import { DynamoDBClient, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client();
const db = new DynamoDBClient();
const BUCKET = "cab432-video-processor-n11676795";
const TABLE = "YourVideosTable";

async function deleteAllUserVideos(userId) {
  const result = await db.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: "userId = :u",
    ExpressionAttributeValues: { ":u": userId }
  }));

  for (const video of result.Items) {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: video.s3Key }));
    await db.send(new DeleteCommand({ TableName: TABLE, Key: { videoId: video.videoId } }));
  }

  console.log("Deleted all videos for user:", userId);
}

deleteAllUserVideos("d97e24f8-50d1-70b4-0594-e348d5f35100");
