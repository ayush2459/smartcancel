import { Amplify } from 'aws-amplify';
import { fetchAuthSession, getCurrentUser, signInWithRedirect, signOut } from 'aws-amplify/auth';
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito';
import { CookieStorage } from 'aws-amplify/utils';

export interface CognitoRuntimeConfig {
  userPoolId: string;
  userPoolClientId: string;
  domain: string;
}

let configuredClientId: string | undefined;
let configuredDomain: string | undefined;

export function getLocalCognitoConfig(): CognitoRuntimeConfig | undefined {
  const { VITE_COGNITO_USER_POOL_ID, VITE_COGNITO_USER_POOL_CLIENT_ID, VITE_COGNITO_DOMAIN } = import.meta.env;
  if (!VITE_COGNITO_USER_POOL_ID || !VITE_COGNITO_USER_POOL_CLIENT_ID || !VITE_COGNITO_DOMAIN) {
    return undefined;
  }

  return {
    userPoolId: VITE_COGNITO_USER_POOL_ID,
    userPoolClientId: VITE_COGNITO_USER_POOL_CLIENT_ID,
    domain: VITE_COGNITO_DOMAIN,
  };
}

export function configureCognito(config: CognitoRuntimeConfig): void {
  const domain = new URL(config.domain).hostname;
  configuredClientId = config.userPoolClientId;
  configuredDomain = `https://${domain}`;

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.userPoolId,
        userPoolClientId: config.userPoolClientId,
        loginWith: {
          oauth: {
            domain,
            scopes: ['openid', 'email', 'profile'],
            redirectSignIn: [`${window.location.origin}/`],
            redirectSignOut: [`${window.location.origin}/`],
            responseType: 'code',
          },
        },
      },
    },
  });

  cognitoUserPoolsTokenProvider.setKeyValueStorage(new CookieStorage({
    path: '/',
    expires: 1,
    sameSite: 'lax',
    secure: window.location.protocol === 'https:',
  }));
}

export function isCognitoConfigured(): boolean {
  return configuredClientId !== undefined;
}

export async function getCognitoCurrentUser(): Promise<void> {
  await getCurrentUser();
}

export async function beginCognitoSignIn(): Promise<void> {
  await signInWithRedirect();
}

export async function getCognitoAccessToken(): Promise<string | undefined> {
  const session = await fetchAuthSession();
  return session.tokens?.accessToken.toString();
}

export async function endCognitoSession(): Promise<void> {
  if (!configuredClientId || !configuredDomain) {
    return;
  }

  await signOut();
  const domain = new URL(configuredDomain);
  domain.pathname = '/logout';
  domain.search = new URLSearchParams({
    client_id: configuredClientId,
    logout_uri: `${window.location.origin}/`,
  }).toString();
  window.location.assign(domain.toString());
}
