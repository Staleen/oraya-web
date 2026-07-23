#!/usr/bin/env node
/**
 * Generate the scrypt hash stored in the `settings.admin_password` row
 * (Remediation 1.1 — plaintext admin passwords are no longer accepted).
 *
 * Usage:
 *   node scripts/hash-admin-password.mjs            # prompts (input hidden)
 *   node scripts/hash-admin-password.mjs 'newpass'  # argv (beware shell history)
 *
 * Then in the Supabase SQL editor:
 *   update settings set value = '<printed hash>' where key = 'admin_password';
 */
import { randomBytes, scryptSync } from "node:crypto";
import { stdin, stdout, argv, exit } from "node:process";

const CTRL_C = String.fromCharCode(3);
const CTRL_D = String.fromCharCode(4);
const BACKSPACE = String.fromCharCode(127);

function hashAdminPassword(password) {
  const N = 16384, r = 8, p = 1;
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32, { N, r, p });
  return ["scrypt", N, r, p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

async function promptHidden(question) {
  return new Promise((resolve) => {
    stdout.write(question);
    const chunks = [];
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.on("data", function onData(ch) {
      const s = ch.toString("utf8");
      for (const c of s) {
        if (c === "\n" || c === "\r" || c === CTRL_D) {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          resolve(chunks.join(""));
          return;
        }
        if (c === CTRL_C) exit(130);
        if (c === BACKSPACE || c === "\b") chunks.pop();
        else chunks.push(c);
      }
    });
  });
}

const fromArg = argv[2];
const password = fromArg ?? (await promptHidden("New admin password (input hidden): "));
if (!password || password.length < 8) {
  console.error("Refusing: password must be at least 8 characters.");
  exit(1);
}
console.log("\nStore this value in settings.admin_password:\n");
console.log(hashAdminPassword(password));
console.log(
  "\nSQL: update settings set value = '<hash above>' where key = 'admin_password';",
);
