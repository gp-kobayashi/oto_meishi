import path from "node:path";
import dotenv from "dotenv";
import { assertAllowedIntegrationTestTargets } from "./connectionTargets";

dotenv.config({
  path: path.resolve(process.cwd(), ".env.integration.local"),
});

function readRequiredVariable(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for integration tests.`);
  }

  return value;
}

const supabaseUrl = readRequiredVariable("INTEGRATION_SUPABASE_URL");
const supabaseAnonKey = readRequiredVariable("INTEGRATION_SUPABASE_ANON_KEY");
const databaseUrl = readRequiredVariable("INTEGRATION_DATABASE_URL");
const serviceRoleKey = readRequiredVariable(
  "INTEGRATION_SUPABASE_SERVICE_ROLE_KEY",
);

assertAllowedIntegrationTestTargets({
  supabaseUrl,
  databaseUrl,
});

process.env.DATABASE_URL = databaseUrl;
process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = supabaseAnonKey;
process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
