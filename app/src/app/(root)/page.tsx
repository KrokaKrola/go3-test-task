import { RootRedirect } from '@/components/RootRedirect/RootRedirect';
import { getConfig } from '@/config';
import { enabledPairs } from '@/domain/markets/markets';
import { getMessages } from '@/i18n/messages/messages';

export default function Root() {
  return <RootRedirect messages={getMessages('et')} pairs={enabledPairs(getConfig().flags)} />;
}
