import axios from 'axios';

/**
 * Telegram alert: one message per transaction, same content style as Discord.
 * Uses Bot API sendMessage. Config from runningBotsStore (token + chatId per bot).
 */

const IN_ICON = '📥';
const OUT_ICON = '📤';

function formatTimeIST(ageStrOrTs) {
  let d = new Date();
  if (ageStrOrTs != null && typeof ageStrOrTs === 'number') {
    d = new Date(ageStrOrTs * 1000);
  } else if (typeof ageStrOrTs === 'string') {
    const trimmed = ageStrOrTs.trim().replace(/\s+(\d{1,2}):(\d{2}):(\d{2})$/, 'T$1:$2:$3Z');
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) d = parsed;
  }
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }) + ' (IST)';
}

function exactAmount(tx) {
  const s = tx.amount != null ? String(tx.amount).trim() : '';
  return s !== '' ? s : String(parseFloat(tx.amount) || 0);
}

function buildMessageBitcoin(tx) {
  const isIn = (tx.inOut || '').toUpperCase() === 'IN';
  const isOut = (tx.inOut || '').toUpperCase() === 'OUT';
  const typeText = isIn ? 'Incoming' : isOut ? 'Outgoing' : 'Transfer';
  const amountStr = exactAmount(tx);
  const usdValue = (tx.amountUsd && tx.amountUsd.trim()) ? `$${tx.amountUsd.trim()}` : '—';
  const timeStr = formatTimeIST(tx.age);
  const status = (tx.status || 'confirmed').toLowerCase();
  const blockHeight = (tx.block && String(tx.block).trim()) || '—';
  const network = (process.env.BTC_NETWORK || 'mainnet').toLowerCase();
  const explorerUrl = network === 'mainnet'
    ? `https://blockstream.info/tx/${tx.transactionHash || ''}`
    : network === 'testnet4'
      ? `https://mempool.space/testnet4/tx/${tx.transactionHash || ''}`
      : `https://blockstream.info/testnet/tx/${tx.transactionHash || ''}`;
  const networkLabel = network === 'mainnet' ? 'Mainnet' : network === 'testnet4' ? 'Testnet4' : 'Testnet3';
  const lines = [
    status === 'pending' ? 'BTC Transaction Alert (Pending)' : (isIn ? 'New BTC received' : 'BTC sent'),
    `Type: ${typeText}`,
    `Amount: ${amountStr} BTC`,
    `USD: ${usdValue}`,
    `Time: ${timeStr}`,
    `Block: ${blockHeight}`,
    `Network: ${networkLabel}`,
    `Tx: ${explorerUrl}`,
  ];
  return lines.join('\n');
}

function buildMessageLitecoin(tx) {
  const isIn = (tx.inOut || '').toUpperCase() === 'IN';
  const isOut = (tx.inOut || '').toUpperCase() === 'OUT';
  const typeText = isIn ? 'Incoming' : isOut ? 'Outgoing' : 'Transfer';
  const amountStr = exactAmount(tx);
  const usdValue = (tx.amountUsd && tx.amountUsd.trim()) ? `$${tx.amountUsd.trim()}` : '—';
  const timeStr = formatTimeIST(tx.age);
  const status = (tx.status || 'confirmed').toLowerCase();
  const blockHeight = (tx.block && String(tx.block).trim()) || '—';
  const network = (process.env.LTC_NETWORK || 'testnet').toLowerCase();
  const explorerUrl = network === 'mainnet'
    ? `https://litecoinspace.org/tx/${tx.transactionHash || ''}`
    : `https://litecoinspace.org/testnet/tx/${tx.transactionHash || ''}`;
  const networkLabel = network === 'mainnet' ? 'Mainnet' : 'Testnet';
  const lines = [
    status === 'pending' ? 'LTC Transaction Alert (Pending)' : (isIn ? 'New LTC received' : 'LTC sent'),
    `Type: ${typeText}`,
    `Amount: ${amountStr} LTC`,
    `USD: ${usdValue}`,
    `Time: ${timeStr}`,
    `Block: ${blockHeight}`,
    `Network: ${networkLabel}`,
    `Tx: ${explorerUrl}`,
  ];
  return lines.join('\n');
}

function buildMessageSolana(tx) {
  const isIn = (tx.inOut || '').toUpperCase() === 'IN';
  const isOut = (tx.inOut || '').toUpperCase() === 'OUT';
  const typeText = isIn ? 'Incoming' : isOut ? 'Outgoing' : 'Transfer';
  const amountStr = exactAmount(tx);
  const usdValue = (tx.amountUsd && tx.amountUsd.trim()) ? `$${tx.amountUsd.trim()}` : '—';
  const timeStr = formatTimeIST(tx.age);
  const status = (tx.status || 'confirmed').toLowerCase();
  const slot = (tx.block && String(tx.block).trim()) || '—';
  const rpc = (process.env.SOL_RPC_URL || '').toLowerCase();
  const network = rpc.includes('devnet') ? 'Devnet' : rpc.includes('testnet') ? 'Testnet' : 'Mainnet';
  const explorerUrl = network === 'Devnet'
    ? `https://explorer.solana.com/tx/${tx.transactionHash || ''}?cluster=devnet`
    : network === 'Testnet'
      ? `https://explorer.solana.com/tx/${tx.transactionHash || ''}?cluster=testnet`
      : `https://explorer.solana.com/tx/${tx.transactionHash || ''}`;
  const lines = [
    status === 'failed' ? 'SOL Transaction Failed' : (isIn ? 'New SOL received' : 'SOL sent'),
    `Type: ${typeText}`,
    `Amount: ${amountStr} SOL`,
    `USD: ${usdValue}`,
    `Time: ${timeStr}`,
    `Slot: ${slot}`,
    `Network: ${network}`,
    `Tx: ${explorerUrl}`,
  ];
  return lines.join('\n');
}

function buildMessageTron(tx) {
  const isIn = (tx.inOut || '').toUpperCase() === 'IN';
  const isOut = (tx.inOut || '').toUpperCase() === 'OUT';
  const typeText = isIn ? 'Incoming' : isOut ? 'Outgoing' : 'Transfer';
  const amountStr = exactAmount(tx);
  const assetName = (tx.token && tx.token.trim()) || 'TRX';
  const usdValue = (tx.amountUsd && tx.amountUsd.trim()) ? `$${tx.amountUsd.trim()}` : '—';
  const timeStr = formatTimeIST(tx.age);
  const status = (tx.status || 'confirmed').toLowerCase();
  const rpc = (process.env.TRON_RPC_URL || '').toLowerCase();
  const network = rpc.includes('shasta') ? 'Shasta Testnet' : rpc.includes('nile') ? 'Nile Testnet' : 'Mainnet';
  const explorerUrl = network.includes('Shasta')
    ? `https://shasta.tronscan.org/#/transaction/${tx.transactionHash || ''}`
    : network.includes('Nile')
      ? `https://nile.tronscan.org/#/transaction/${tx.transactionHash || ''}`
      : `https://tronscan.org/#/transaction/${tx.transactionHash || ''}`;
  const lines = [
    status === 'failed' ? 'TRX Transaction Failed' : (isIn ? 'New TRX received' : 'TRX sent'),
    `Type: ${typeText}`,
    `Amount: ${amountStr} ${assetName}`,
    `USD: ${usdValue}`,
    `Time: ${timeStr}`,
    `Network: ${network}`,
    `Tx: ${explorerUrl}`,
  ];
  return lines.join('\n');
}

function buildMessageEthereumOrBnb(tx) {
  const walletType = (tx.walletType || 'Ethereum').trim();
  const isBnb = walletType === 'BNB';
  const chainLabel = isBnb ? 'BNB' : 'ETH';
  const chainName = isBnb ? 'BNB' : 'Ethereum';
  const tokenName = (tx.token && String(tx.token).trim()) || chainLabel;
  const explorerBase = isBnb ? 'https://bscscan.com/tx' : 'https://etherscan.io/tx';
  const txUrl = `${explorerBase}/${tx.transactionHash || ''}`;
  const isIn = (tx.inOut || '').toUpperCase() === 'IN';
  const isOut = (tx.inOut || '').toUpperCase() === 'OUT';
  const typeText = isIn ? 'Incoming' : isOut ? 'Outgoing' : 'Transfer';
  const amountVal = tx.amount || '—';
  const usdVal = tx.amountUsd || '—';
  const timeVal = tx.age ? formatTimeIST(tx.age) : '—';
  const blockVal = (tx.block && String(tx.block).trim()) || '—';
  const lines = [
    `${chainName} ${typeText}`,
    `Asset: ${tokenName}`,
    `Amount: ${amountVal}`,
    `USD: ${usdVal}`,
    `Time: ${timeVal}`,
    `Block: ${blockVal}`,
    `Tx: ${txUrl}`,
  ];
  return lines.join('\n');
}

function buildMessageForTx(tx) {
  const walletType = (tx.walletType || 'Ethereum').trim();
  switch (walletType) {
    case 'Bitcoin':
      return buildMessageBitcoin(tx);
    case 'Litecoin':
      return buildMessageLitecoin(tx);
    case 'Solana':
      return buildMessageSolana(tx);
    case 'Tron':
      return buildMessageTron(tx);
    case 'BNB':
    case 'Ethereum':
    default:
      return buildMessageEthereumOrBnb(tx);
  }
}

const TELEGRAM_API_BASE = 'https://api.telegram.org';

/**
 * Send one transaction as one Telegram message.
 */
export async function sendTransactionAlert(token, chatId, tx) {
  if (!token || !chatId || !tx) return;
  const text = buildMessageForTx(tx);
  const url = `${TELEGRAM_API_BASE}/bot${token}/sendMessage`;
  const res = await axios.post(
    url,
    { chat_id: chatId, text },
    { timeout: 10000, validateStatus: () => true }
  );
  if (res.status !== 200 || !res.data?.ok) {
    throw new Error(res.data?.description || `Telegram ${res.status}`);
  }
}

/**
 * Send one message per transaction (same pattern as Discord one-per-tx).
 */
export async function sendTransactionAlertsBatch(token, chatId, txList) {
  if (!token || !chatId || !txList || txList.length === 0) return;
  for (const tx of txList) {
    try {
      await sendTransactionAlert(token, chatId, tx);
    } catch (e) {
      throw e;
    }
  }
}
