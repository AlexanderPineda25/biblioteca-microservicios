import { MessagingObserver } from './MessagingObserver.js';
import { LoggingObserver } from './LoggingObserver.js';

export function registerObservers() {
  MessagingObserver.register();
  LoggingObserver.register();
  console.log('[Observers] All observers registered successfully');
}
