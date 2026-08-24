import { signIn } from '@/auth';

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <form
        action={async () => {
          'use server';
          await signIn('github', { redirectTo: '/' });
        }}
      >
        <button type="submit" className="rounded bg-gray-900 px-4 py-2 text-white">
          Sign in with GitHub
        </button>
      </form>
      <form
        action={async () => {
          'use server';
          await signIn('google', { redirectTo: '/' });
        }}
      >
        <button type="submit" className="rounded border border-gray-900 px-4 py-2">
          Sign in with Google
        </button>
      </form>
    </main>
  );
}
