import { listAvailableModels } from '@/lib/models';
import { signOut } from '@/auth';
import { ChatPage } from '@/components/chat-page';

export default function Home() {
  return (
    <div>
      <form
        action={async () => {
          'use server';
          await signOut({ redirectTo: '/sign-in' });
        }}
        className="flex justify-end p-2"
      >
        <button type="submit" className="text-sm text-gray-500 underline">
          Sign out
        </button>
      </form>
      <ChatPage availableModels={listAvailableModels()} />
    </div>
  );
}
