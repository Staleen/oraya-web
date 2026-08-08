import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";
import { CompactEncrypt, compactDecrypt, decodeProtectedHeader, jwtVerify } from "jose";

import {
  buildCyberSourceDigest,
  buildCyberSourceJwtAuthorization,
  decryptCyberSourceResponse,
  encryptCyberSourceRequest,
} from "./cybersource-jwt-mle.ts";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

test("CyberSource JWT has the required v2 claims and signs the exact HTTP body", async () => {
  const body = JSON.stringify({ amount: "10.00", currency: "USD" });
  const sharedSecret = Buffer.from("a deterministic test secret with enough bytes").toString("base64");
  const authorization = await buildCyberSourceJwtAuthorization({
    body,
    host: "apitest.cybersource.com",
    keyId: "test-key-id",
    merchantId: "oraya_test",
    path: "/pts/v2/payments",
    responseMleKeyId: "response-mle-key-id",
    sharedSecret,
    issuedAt: 1_700_000_000,
    jwtId: "12345678-1234-4123-8123-123456789012",
  });

  assert.match(authorization, /^Bearer /);
  const token = authorization.slice("Bearer ".length);
  assert.deepEqual(decodeProtectedHeader(token), {
    alg: "HS256",
    kid: "test-key-id",
    typ: "JWT",
  });
  const { payload } = await jwtVerify(token, Buffer.from(sharedSecret, "base64"), {
    algorithms: ["HS256"],
    issuer: "oraya_test",
    currentDate: new Date(1_700_000_001_000),
  });
  assert.equal(payload.digest, buildCyberSourceDigest(body));
  assert.equal(payload.digestAlgorithm, "SHA-256");
  assert.equal(payload.iat, 1_700_000_000);
  assert.equal(payload.exp, 1_700_000_120);
  assert.equal(payload.jti, "12345678-1234-4123-8123-123456789012");
  assert.equal(payload["request-host"], "apitest.cybersource.com");
  assert.equal(payload["request-method"], "post");
  assert.equal(payload["request-resource-path"], "/pts/v2/payments");
  assert.equal(payload["v-c-jwt-version"], "2");
  assert.equal(payload["v-c-merchant-id"], "oraya_test");
  assert.equal(payload["v-c-response-mle-kid"], "response-mle-key-id");
});

test("Unified Checkout session JWT omits the response-MLE claim", async () => {
  const sharedSecret = Buffer.from("another deterministic test secret value").toString("base64");
  const authorization = await buildCyberSourceJwtAuthorization({
    body: "{}",
    host: "apitest.cybersource.com",
    keyId: "test-key-id",
    merchantId: "oraya_test",
    path: "/uc/v1/sessions",
    sharedSecret,
    issuedAt: 1_700_000_000,
    jwtId: "22345678-1234-4123-8123-123456789012",
  });
  const { payload } = await jwtVerify(
    authorization.slice("Bearer ".length),
    Buffer.from(sharedSecret, "base64"),
    { currentDate: new Date(1_700_000_001_000) },
  );
  assert.equal(payload["request-resource-path"], "/uc/v1/sessions");
  assert.equal(payload["v-c-response-mle-kid"], undefined);
});

test("payment request MLE encrypts the payload in the required envelope", async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  const payload = JSON.stringify({ clientReferenceInformation: { code: "oraya-att-test" } });
  const body = await encryptCyberSourceRequest({
    payload,
    requestMleCertificate: publicKeyPem,
    requestMleKeyId: "sjc-test-key",
  });
  const envelope = JSON.parse(body) as { encryptedRequest: string };
  const decrypted = await compactDecrypt(envelope.encryptedRequest, privateKey);

  assert.equal(textDecoder.decode(decrypted.plaintext), payload);
  assert.deepEqual(decrypted.protectedHeader, {
    alg: "RSA-OAEP",
    enc: "A256GCM",
    cty: "JWT",
    kid: "sjc-test-key",
  });
});

test("payment response MLE decrypts only the expected key and algorithms", async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const expected = { id: "payment-123", status: "AUTHORIZED" };
  const encryptedResponse = await new CompactEncrypt(textEncoder.encode(JSON.stringify(expected)))
    .setProtectedHeader({ alg: "RSA-OAEP-256", enc: "A256GCM", kid: "response-key" })
    .encrypt(publicKey);

  const actual = await decryptCyberSourceResponse<typeof expected>({
    body: JSON.stringify({ encryptedResponse }),
    expectedKeyId: "response-key",
    responseMlePrivateKey: privateKeyPem,
  });
  assert.deepEqual(actual, expected);

  await assert.rejects(
    decryptCyberSourceResponse({
      body: JSON.stringify({ encryptedResponse }),
      expectedKeyId: "wrong-key",
      responseMlePrivateKey: privateKeyPem,
    }),
    /unexpected encryption metadata/,
  );
  await assert.rejects(
    decryptCyberSourceResponse({
      body: JSON.stringify({ status: "AUTHORIZED" }),
      expectedKeyId: "response-key",
      responseMlePrivateKey: privateKeyPem,
    }),
    /did not contain encryptedResponse/,
  );
});
