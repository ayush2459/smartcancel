import { useEffect, useState, type ReactNode } from 'react';
import {
  beginCognitoSignIn,
  endCognitoSession,
  getCognitoCurrentUser,
  isCognitoConfigured,
} from './cognito';

type AuthState = 'checking' | 'signed-out' | 'signed-in';

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(isCognitoConfigured() ? 'checking' : 'signed-in');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isCognitoConfigured()) return;

    void getCognitoCurrentUser()
      .then(() => setState('signed-in'))
      .catch((authError: unknown) => {
        if (authError instanceof Error && authError.name === 'UserUnAuthenticatedException') {
          setState('signed-out');
          return;
        }
        setError(authError instanceof Error ? authError.message : 'Unable to verify your sign-in session.');
      });
  }, []);

  if (!isCognitoConfigured()) return children;

  if (state === 'checking' && !error) {
    return <AuthMessage message="Checking your sign-in..." />;
  }

  if (state === 'signed-out' || error) {
    return (
      <AuthMessage message={error ?? 'Sign in with your invited SmartCancy account to continue.'}>
        {!error && (
          <button
            className="rounded-xl bg-amber-500 px-5 py-3 font-semibold text-slate-950 hover:bg-amber-400"
            onClick={() => {
              setError(null);
              void beginCognitoSignIn().catch((signInError: unknown) => {
                setError(signInError instanceof Error ? signInError.message : 'Unable to start sign-in.');
              });
            }}
          >
            Sign in
          </button>
        )}
        {error && (
          <button
            className="rounded-xl border border-slate-600 px-5 py-3 font-semibold text-white hover:bg-slate-800"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        )}
      </AuthMessage>
    );
  }

  return (
    <>
      <button
        className="fixed right-3 top-3 z-[60] rounded-lg border border-slate-300 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
        onClick={() => {
          void endCognitoSession().catch((signOutError: unknown) => {
            setError(signOutError instanceof Error ? signOutError.message : 'Unable to sign out.');
          });
        }}
      >
        Sign out
      </button>
      {children}
    </>
  );
}

function AuthMessage({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5 text-white">
      <section className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-400">SmartCancy</p>
        <h1 className="mt-3 text-2xl font-bold">Secure sign-in</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">{message}</p>
        {children && <div className="mt-6">{children}</div>}
      </section>
    </main>
  );
}
