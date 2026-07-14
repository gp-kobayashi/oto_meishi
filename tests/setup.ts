import { beforeAll } from 'vitest';

// 環境変数の設定（DockerのSupabaseを使用）
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://host.docker.internal:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

beforeAll(() => {
  // テスト前のセットアップ
  console.log('Test setup complete');
});
