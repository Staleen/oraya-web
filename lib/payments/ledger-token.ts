import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const VERSION = "v1";

function key(secret: string) {
  return createHash("sha256").update(`oraya-payment-request:${secret}`, "utf8").digest();
}
export function createPaymentRequestToken() {
  return randomBytes(32).toString("base64url");
}

export function hashPaymentRequestToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function encryptPaymentRequestToken(token: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptPaymentRequestToken(value: string, secret: string) {
  try {
    const [version, ivRaw, tagRaw, encryptedRaw, extra] = value.split(".");
    if (version !== VERSION || !ivRaw || !tagRaw || !encryptedRaw || extra) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(secret), Buffer.from(ivRaw, "base64url"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
