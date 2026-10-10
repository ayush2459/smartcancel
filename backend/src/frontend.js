import path from 'node:path';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

const s3 = new S3Client({});
const securityHeaders = {
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

function runtimeConfig() {
  const config = {
    userPoolId: process.env.COGNITO_USER_POOL_ID,
    userPoolClientId: process.env.COGNITO_USER_POOL_CLIENT_ID,
    domain: process.env.COGNITO_DOMAIN,
  };

  if (Object.values(config).some((value) => !value)) {
    throw new Error('Frontend authentication configuration is incomplete.');
  }

  return config;
}

function response(statusCode, headers, body, isBase64Encoded = false) {
  return {
    statusCode,
    headers: { ...securityHeaders, ...headers },
    body,
    isBase64Encoded,
  };
}

function isMissingObject(error) {
  return error instanceof Error
    && (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404);
}

export async function handler(event) {
  let pathname;
  try {
    pathname = decodeURIComponent(event.rawPath || '/');
  } catch {
    return response(400, { 'content-type': 'text/plain' }, 'Invalid request path.');
  }

  if (!pathname.startsWith('/') || pathname.split('/').includes('..')) {
    return response(400, { 'content-type': 'text/plain' }, 'Invalid request path.');
  }

  if (pathname === '/runtime-config.json') {
    try {
      return response(200, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      }, JSON.stringify(runtimeConfig()));
    } catch (error) {
      console.error('Unable to create frontend runtime configuration:', error);
      return response(500, { 'content-type': 'text/plain' }, 'Frontend configuration is unavailable.');
    }
  }

  const key = pathname === '/' || !path.extname(pathname)
    ? 'index.html'
    : pathname.slice(1);

  try {
    const object = await s3.send(new GetObjectCommand({
      Bucket: process.env.FRONTEND_BUCKET,
      Key: key,
    }));
    if (!object.Body) {
      throw new Error(`S3 returned an empty body for "${key}".`);
    }

    const headers = {
      'content-type': object.ContentType || 'application/octet-stream',
      'cache-control': key.startsWith('assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
      'x-content-type-options': 'nosniff',
    };
    if (object.ContentEncoding) headers['content-encoding'] = object.ContentEncoding;

    const body = Buffer.from(await object.Body.transformToByteArray()).toString('base64');
    return response(200, headers, body, true);
  } catch (error) {
    if (isMissingObject(error)) {
      return response(404, {
        'content-type': 'text/plain',
        'x-content-type-options': 'nosniff',
      }, 'Not found.');
    }

    console.error(`Unable to serve frontend object "${key}":`, error);
    return response(500, { 'content-type': 'text/plain' }, 'Frontend content is unavailable.');
  }
}
