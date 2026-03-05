import dotenv from "dotenv";
import { D365Connection } from "../../src/d365/connection.js";

dotenv.config();

const requiredEnvVars = ["D365_URL", "D365_CLIENT_ID", "D365_CLIENT_SECRET", "D365_TENANT_ID"];

function getMissingEnvVars(): string[] {
  return requiredEnvVars.filter((name) => !process.env[name]);
}

describe("D365Connection integration", () => {
  const missing = getMissingEnvVars();

  if (missing.length > 0) {
    it("skips integration tests when required env vars are missing", () => {
      console.warn(`Skipping integration test. Missing env vars: ${missing.join(", ")}`);
      expect(missing.length).toBeGreaterThan(0);
    });
    return;
  }

  const config = {
    url: process.env.D365_URL!,
    clientId: process.env.D365_CLIENT_ID!,
    clientSecret: process.env.D365_CLIENT_SECRET!,
    tenantId: process.env.D365_TENANT_ID!,
  };

  it("connects successfully using .env credentials (WhoAmI)", async () => {
    const connection = new D365Connection(config);
    await expect(connection.connect()).resolves.toBeUndefined();
  }, 30000);

  it("returns configured URL", () => {
    const connection = new D365Connection(config);
    expect(connection.getUrl()).toBe(config.url);
  });
});
