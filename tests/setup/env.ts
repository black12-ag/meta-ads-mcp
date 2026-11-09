process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://127.0.0.1:5432/ethio_ads_test";
process.env.CREATIVE_URL_SECRET = "test-secret";
process.env.TOKEN_ENCRYPTION_KEY = "0".repeat(64);
process.env.CREATIVES_DIR = "/tmp/ethio-ads-test-creatives";
