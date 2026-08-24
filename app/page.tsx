import { listAvailableModels } from '@/lib/models';
import { ChatPage } from '@/components/chat-page';
import { AppShell } from '@/components/app-shell';

export default function Home() {
  return (
    <AppShell>
      <ChatPage availableModels={listAvailableModels()} />
    </AppShell>
  );
}
