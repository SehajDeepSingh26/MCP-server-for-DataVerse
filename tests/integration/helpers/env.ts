import dotenv from "dotenv";

import { D365Config } from "../../../src/types/index.js";

dotenv.config();

export const requiredD365EnvVars = [
  "D365_URL",
  "D365_CLIENT_ID",
  "D365_CLIENT_SECRET",
  "D365_TENANT_ID",
] as const;

export function getMissingD365EnvVars(): string[] {
  return requiredD365EnvVars.filter((name) => !process.env[name]);
}

export function createD365IntegrationConfig(): D365Config {
  return {
    url: process.env.D365_URL!,
    clientId: process.env.D365_CLIENT_ID!,
    clientSecret: process.env.D365_CLIENT_SECRET!,
    tenantId: process.env.D365_TENANT_ID!,
  };
}

export function createIntegrationRunTag(prefix = "it"): string {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${randomPart}`;
}
