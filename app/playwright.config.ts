import { defineConfig } from '@playwright/test';

const mockPort = process.env.E2E_MOCK_PORT ?? '4010';
const appPort = process.env.E2E_APP_PORT ?? '3000';
const mockOrigin = `http://localhost:${mockPort}`;
const appOrigin = `http://localhost:${appPort}`;

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  use: { baseURL: appOrigin, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    {
      command: 'npm run mock',
      cwd: '..',
      url: `${mockOrigin}/v1/plans?market=EE`,
      env: { MOCK_TIME_SCALE: '50', PORT: mockPort, WEB_ORIGIN: appOrigin },
      reuseExistingServer: false,
    },
    {
      command: `npx next dev -p ${appPort}`,
      url: appOrigin,
      env: { NEXT_PUBLIC_API_BASE: mockOrigin },
      reuseExistingServer: false,
    },
  ],
});
