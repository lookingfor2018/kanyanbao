const crypto = require("crypto");
const fs = require("fs");
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

function isStorageConfigured(env) {
  return Boolean(
    env.storage.endpoint &&
      env.storage.bucket &&
      env.storage.accessKey &&
      env.storage.secretKey
  );
}

function buildS3Client(env) {
  return new S3Client({
    region: env.storage.region || "auto",
    endpoint: env.storage.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.storage.accessKey,
      secretAccessKey: env.storage.secretKey,
    },
  });
}

function buildObjectKey(prefix, runDate) {
  const randomHex = crypto.randomBytes(16).toString("hex");
  const normalizedPrefix = String(prefix || "reports").replace(/^\/+|\/+$/g, "");
  return `${normalizedPrefix}/${runDate}/${randomHex}.pdf`;
}

async function uploadPdfAndSignUrl({
  env,
  runDate,
  localFilePath,
}) {
  const client = buildS3Client(env);
  const objectKey = buildObjectKey(env.storage.prefix, runDate);
  const body = fs.readFileSync(localFilePath);

  await client.send(
    new PutObjectCommand({
      Bucket: env.storage.bucket,
      Key: objectKey,
      Body: body,
      ContentType: "application/pdf",
      CacheControl: "private, max-age=0, no-store",
    })
  );

  const signedUrl = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: env.storage.bucket,
      Key: objectKey,
    }),
    { expiresIn: env.storage.signedUrlTtlSeconds || 604800 }
  );

  return {
    bucket: env.storage.bucket,
    object_key: objectKey,
    signed_url: signedUrl,
  };
}

module.exports = {
  isStorageConfigured,
  uploadPdfAndSignUrl,
};

