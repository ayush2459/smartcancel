import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AuthGate } from './auth/AuthGate';
import { configureCognito, getLocalCognitoConfig, type CognitoRuntimeConfig } from './auth/cognito';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('The root element is missing.');
const root = createRoot(rootElement);

function isCognitoRuntimeConfig(value: unknown): value is CognitoRuntimeConfig {
  if (!value || typeof value !== 'object') return false;
  return 'userPoolId' in value
    && typeof value.userPoolId === 'string'
    && 'userPoolClientId' in value
    && typeof value.userPoolClientId === 'string'
    && 'domain' in value
    && typeof value.domain === 'string';
}

async function loadCognitoConfig(): Promise<CognitoRuntimeConfig | undefined> {
  const localConfig = getLocalCognitoConfig();
  if (localConfig) return localConfig;
  if (import.meta.env.DEV) return undefined;

  const response = await fetch('/runtime-config.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Unable to load sign-in configuration (${response.status}).`);
  }

  const body: unknown = await response.json();
  if (!isCognitoRuntimeConfig(body)) {
    throw new Error('The deployment sign-in configuration is incomplete.');
  }
  return body;
}

void loadCognitoConfig()
  .then((config) => {
    if (config) configureCognito(config);
    root.render(<AuthGate><App /></AuthGate>);
  })
  .catch((error: unknown) => {
    root.render(
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 text-white">
        <p className="max-w-xl rounded-xl border border-red-900 bg-red-950 p-6">
          {error instanceof Error ? error.message : 'Unable to initialize sign-in.'}
        </p>
      </main>,
    );
  });
