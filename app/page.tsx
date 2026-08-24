import { listAllModelsWithAvailability } from '@/lib/models';
import { ChatPage } from '@/components/chat-page';
import { AppShell } from '@/components/app-shell';

export default function Home() {
  return (
    <AppShell>
      <ChatPage allModels={listAllModelsWithAvailability()} />
    </AppShell>
  );
}
