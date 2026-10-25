import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { buildFcmMessage, buildServiceAccountJwt } = await import("./push");

describe("buildServiceAccountJwt", () => {
  it("produces a verifiable RS256 token with the FCM scope", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const jwt = buildServiceAccountJwt("bot@projet.iam.gserviceaccount.com", pem, 1_000);
    const [header, claims, signature] = jwt.split(".");

    const ok = createVerify("RSA-SHA256").update(`${header}.${claims}`).verify(publicKey, signature!, "base64url");
    expect(ok).toBe(true);
    expect(JSON.parse(Buffer.from(claims!, "base64url").toString())).toEqual({
      iss: "bot@projet.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_000,
      exp: 4_600,
    });
  });
});

describe("buildFcmMessage", () => {
  it("carries the deep link and truncates long bodies", () => {
    const msg = buildFcmMessage("tok", { title: "Léa", body: "x".repeat(300), url: "/messages/abc" });
    expect(msg.message.data.url).toBe("/messages/abc");
    expect(msg.message.notification.body).toHaveLength(178);
  });
});
