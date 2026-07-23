import { beforeAll } from 'vitest';

// 単体テストでは外部サービスへ接続しないため、安全なダミー値のみを使用する
process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:1/test';
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

beforeAll(() => {
  // テスト前のセットアップ
  console.log('Test setup complete');
});
