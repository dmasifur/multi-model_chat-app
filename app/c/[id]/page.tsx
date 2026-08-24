import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { listAvailableModels } from '@/lib/models';
import { getConversationWithMessages, groupMessagesByModel } from '@/lib/conversations';
import { ChatPage } from '@/components/chat-page';
import { AppShell } from '@/components/app-shell';

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    notFound();
  }

  const conversation = await getConversationWithMessages(session.user.id, id);
  if (!conversation) {
    notFound();
  }

  return (
    <AppShell>
      <ChatPage
        availableModels={listAvailableModels()}
        conversationId={conversation.id}
        initialColumns={groupMessagesByModel(conversation.messages)}
      />
    </AppShell>
  );
}
