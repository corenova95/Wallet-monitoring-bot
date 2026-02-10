/**
 * Solana real-time subscription disabled: all chains use scraping/polling.
 * Run/Stop still call start/stop so bot routes need no change; they are no-ops.
 */
export function startSubscription(_address) {}
export function stopSubscription(_address) {}
export function getSubscribedSolAddresses() {
  return [];
}
