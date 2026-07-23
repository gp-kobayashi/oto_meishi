const ALLOWED_INTEGRATION_TEST_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "host.docker.internal",
]);

type IntegrationTestConnectionTargets = {
  supabaseUrl: string | undefined;
  databaseUrl: string | undefined;
};

function parseConnectionUrl(
  value: string | undefined,
  variableName: string,
  allowedProtocols: ReadonlySet<string>,
) {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    throw new Error(`${variableName} is required for integration tests.`);
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(normalizedValue);
  } catch {
    throw new Error(`${variableName} must be a valid URL.`);
  }

  if (!allowedProtocols.has(parsedUrl.protocol)) {
    throw new Error(
      `${variableName} uses an unsupported protocol: ${parsedUrl.protocol}`,
    );
  }

  const hostname = parsedUrl.hostname
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1");

  if (!ALLOWED_INTEGRATION_TEST_HOSTS.has(hostname)) {
    throw new Error(
      `${variableName} points to a host that is not allowed for integration tests: ${hostname}`,
    );
  }

  return parsedUrl;
}

export function assertAllowedIntegrationTestTargets({
  supabaseUrl,
  databaseUrl,
}: IntegrationTestConnectionTargets) {
  parseConnectionUrl(
    supabaseUrl,
    "INTEGRATION_SUPABASE_URL",
    new Set(["http:", "https:"]),
  );
  parseConnectionUrl(
    databaseUrl,
    "INTEGRATION_DATABASE_URL",
    new Set(["postgres:", "postgresql:"]),
  );
}
