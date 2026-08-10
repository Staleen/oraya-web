import crypto from "crypto";
import {
  CompactEncrypt,
  SignJWT,
  compactDecrypt,
  importPKCS8,
  importSPKI,
  importX509,
} from "jose";

const JWT_TTL_SECONDS = 120;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function normalizePem(value: string) {
  return value.replace(/\\n/g, "\n").trim();
}

async function importRequestEncryptionKey(pem: string) {
  const normalized = normalizePem(pem);
  if (normalized.includes("BEGIN CERTIFICATE")) {
    return importX509(normalized, "RSA-OAEP");
  }
  return importSPKI(normalized, "RSA-OAEP");
}

export function buildCyberSourceDigest(body: string) {
  return crypto.createHash("sha256").update(body, "utf8").digest("base64");
}

export async function buildCyberSourceJwtAuthorization({
  body,
  host,
  keyId,
  merchantId,
  path,
  responseMleKeyId,
  sharedSecret,
  issuedAt = Math.floor(Date.now() / 1000),
  jwtId = crypto.randomUUID(),
  requestMethod = "post",
}: {
  body: string;
  host: string;
  keyId: string;
  merchantId: string;
  path: string;
  responseMleKeyId?: string;
  sharedSecret: string;
  issuedAt?: number;
  jwtId?: string;
  /** CyberSource JWT v2 request-method claim. Defaults to POST. */
  requestMethod?: "get" | "post";
}) {
  const claims: Record<string, string | number> = {
    digest: buildCyberSourceDigest(body),
    digestAlgorithm: "SHA-256",
    exp: issuedAt + JWT_TTL_SECONDS,
    iat: issuedAt,
    iss: merchantId,
    jti: jwtId,
    "request-host": host,
    "request-method": requestMethod,
    "request-resource-path": path,
    "v-c-jwt-version": "2",
    "v-c-merchant-id": merchantId,
  };
  if (responseMleKeyId) {
    claims["v-c-response-mle-kid"] = responseMleKeyId;
  }

  const secret = Buffer.from(sharedSecret, "base64");
  if (secret.length === 0) {
    throw new Error("CyberSource shared secret is not valid base64 key material.");
  }

  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", kid: keyId, typ: "JWT" })
    .sign(secret);

  return `Bearer ${token}`;
}

export async function encryptCyberSourceRequest({
  payload,
  requestMleCertificate,
  requestMleKeyId,
}: {
  payload: string;
  requestMleCertificate: string;
  requestMleKeyId: string;
}) {
  const publicKey = await importRequestEncryptionKey(requestMleCertificate);
  const encryptedRequest = await new CompactEncrypt(textEncoder.encode(payload))
    .setProtectedHeader({
      alg: "RSA-OAEP",
      enc: "A256GCM",
      cty: "JWT",
      kid: requestMleKeyId,
    })
    .encrypt(publicKey);

  return JSON.stringify({ encryptedRequest });
}

export async function decryptCyberSourceResponse<T>({
  body,
  expectedKeyId,
  responseMlePrivateKey,
}: {
  body: string;
  expectedKeyId: string;
  responseMlePrivateKey: string;
}): Promise<T> {
  let envelope: unknown;
  try {
    envelope = JSON.parse(body);
  } catch {
    throw new Error("CyberSource MLE response was not valid JSON.");
  }
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    throw new Error("CyberSource MLE response was not a JSON object.");
  }
  const encryptedResponse = (envelope as Record<string, unknown>).encryptedResponse;
  if (typeof encryptedResponse !== "string" || !encryptedResponse.trim()) {
    // Org contract (2026-08-10, mirrors the webhook payloadEncryption=false
    // decision): response MLE is not enabled for Oraya's production
    // organization, so /pts/v2/payments answers with a plaintext JSON body.
    // Live evidence: a real authorization response without encryptedResponse
    // was refused here and marked an attempt ambiguous. The transport is the
    // JWT-authenticated HTTPS channel; the plaintext object IS the response.
    // When CyberSource later enables response MLE, the encrypted path below
    // resumes automatically.
    return envelope as T;
  }

  const privateKey = await importPKCS8(normalizePem(responseMlePrivateKey), "RSA-OAEP-256");
  const { plaintext, protectedHeader } = await compactDecrypt(encryptedResponse, privateKey);
  if (
    protectedHeader.alg !== "RSA-OAEP-256" ||
    protectedHeader.enc !== "A256GCM" ||
    protectedHeader.kid !== expectedKeyId
  ) {
    throw new Error("CyberSource MLE response used unexpected encryption metadata.");
  }

  try {
    return JSON.parse(textDecoder.decode(plaintext)) as T;
  } catch {
    throw new Error("CyberSource decrypted response was not valid JSON.");
  }
}
