import Link from 'next/link';
import { auth, signOut } from '@/auth';
import { listConversations } from '@/lib/conversations';

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const conversations = session?.user?.id ? await listConversations(session.user.id) : [];

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 border-r p-4">
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/sign-in' });
          }}
        >
          <button type="submit" className="text-sm text-gray-500 underline">
            Sign out
          </button>
        </form>
        <Link href="/" className="mt-4 block font-semibold">
          + New chat
        </Link>
        <ul className="mt-4 space-y-1">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={`/c/${conversation.id}`}
                className="block truncate text-sm hover:underline"
              >
                {conversation.title}
              </Link>
            </li>
          ))}
        </ul>
      </aside>
      <div className="flex-1">{children}</div>
    </div>
  );
}
