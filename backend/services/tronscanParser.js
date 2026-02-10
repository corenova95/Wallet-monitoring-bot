/**
 * Tron address data via Tronscan HTML scraping only (no API/RPC).
 * On 403 or fetch error returns empty balance and transactions so the app does not spam logs.
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { getTrxUsd } from './priceService.js';
import { toAgeStringIST } from '../utils/dateIST.js';

const BASE = process.env.TRONSCAN_BASE || 'https://tronscan.org';

const AXIOS_OPTS = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': `${BASE}/`,
    'Origin': BASE,
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
  },
  timeout: 15000,
  validateStatus: (s) => s === 200 || s === 404,
  maxRedirects: 5,
};

function emptyTronResult() {
  return {
    tronBalance: '0 TRX',
    tronValue: '',
    transactions: [],
    tokenTransactions: [],
    maxBlockTimestamp: null,
  };
}

export async function fetchAddressPage(address) {
  const base = BASE.replace(/\/$/, '');
  const addr = encodeURIComponent(address);
  let url = `${base}/address/${addr}`;
  let res = await axios.get(url, { ...AXIOS_OPTS, validateStatus: () => true });
  if (res.status === 403) {
    url = `${base}/#/address/${address}`;
    res = await axios.get(url, { ...AXIOS_OPTS, validateStatus: () => true });
  }
  if (res.status !== 200) throw new Error(`Request failed with status code ${res.status}`);
  return res.data;
}

function tryParseEmbeddedData(html) {
  const nextData = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextData) {
    try {
      return JSON.parse(nextData[1]);
    } catch (_) {}
  }
  const scriptMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*({[\s\S]*?});?\s*<\/script>/);
  if (scriptMatch) {
    try {
      return JSON.parse(scriptMatch[1]);
    } catch (_) {}
  }
  return null;
}

function parseBalanceFromCheerio($) {
  const text = $('body').text();
  const trxMatch = text.match(/(\d+(?:\.\d+)?)\s*TRX/i);
  if (trxMatch) return `${trxMatch[1]} TRX`;
  return '0 TRX';
}

function parseTransactionsFromCheerio($, walletAddress, trxPriceUsd = 0) {
  const transactions = [];
  const base = BASE.replace(/\/$/, '');
  $('a[href*="/transaction/"], a[href*="#/transaction/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/\/transaction\/([a-fA-F0-9]{64})/);
    if (!match) return;
    const txHash = match[1];
    const $row = $(el).closest('tr, div').first();
    const rowText = $row.text();
    const amountMatch = rowText.match(/(\d+(?:\.\d+)?)\s*TRX/);
    const amountTrx = amountMatch ? parseFloat(amountMatch[1]) : 0;
    const amountUsd = trxPriceUsd > 0 && amountTrx > 0 ? (amountTrx * trxPriceUsd).toFixed(2) : '';
    if (transactions.some((t) => t.transactionHash === txHash)) return;
    transactions.push({
      transactionHash: txHash,
      walletAddress,
      walletType: 'Tron',
      txType: 'tron',
      token: 'TRX',
      method: 'Transfer',
      block: '',
      age: '',
      from: '',
      to: '',
      inOut: 'ANY',
      amount: String(amountTrx),
      amountUsd,
      txnFee: '',
      status: 'confirmed',
    });
  });
  return transactions;
}

export function parseAddressHtml(html, walletAddress, trxPriceUsd = 0) {
  const $ = cheerio.load(html);
  const embedded = tryParseEmbeddedData(html);
  let balance = '0 TRX';
  let transactions = [];
  let maxBlockTimestamp = null;

  if (embedded?.props?.pageProps?.account?.balance != null) {
    const bal = Number(embedded.props.pageProps.account.balance) || 0;
    balance = `${bal / 1e6} TRX`;
  }
  if (embedded?.props?.pageProps?.transactions?.data?.length) {
    const txs = embedded.props.pageProps.transactions.data;
    const seenHash = new Set();
    for (const tx of txs) {
      const hash = tx.hash || tx.txID || tx.tx_id;
      if (!hash || seenHash.has(hash)) continue;
      seenHash.add(hash);
      const blockTs = tx.block_timestamp ?? tx.blockTime;
      if (blockTs && (!maxBlockTimestamp || blockTs > maxBlockTimestamp)) maxBlockTimestamp = blockTs;
      const amount = tx.amount != null ? tx.amount / 1e6 : 0;
      const amountUsd = trxPriceUsd > 0 && amount > 0 ? (amount * trxPriceUsd).toFixed(2) : '';
      const ageStr = blockTs ? toAgeStringIST(blockTs >= 1e12 ? blockTs : blockTs * 1000) : '';
      transactions.push({
        transactionHash: hash,
        walletAddress,
        walletType: 'Tron',
        txType: 'tron',
        token: tx.tokenInfo?.symbol || 'TRX',
        method: 'Transfer',
        block: tx.block != null ? String(tx.block) : '',
        age: ageStr,
        from: tx.from || '',
        to: tx.to || '',
        inOut: tx.to === walletAddress ? 'IN' : 'OUT',
        amount: String(amount),
        amountUsd,
        txnFee: '',
        status: 'confirmed',
      });
    }
  }

  if (transactions.length === 0) {
    balance = parseBalanceFromCheerio($);
    transactions = parseTransactionsFromCheerio($, walletAddress, trxPriceUsd);
  }

  const balanceNum = parseFloat(balance) || 0;
  const value = trxPriceUsd > 0 ? (balanceNum * trxPriceUsd).toFixed(2) : '';
  const tokenTransactions = transactions.filter((t) => t.token && t.token !== 'TRX');
  const nativeTransactions = transactions.filter((t) => !t.token || t.token === 'TRX');

  return {
    tronBalance: balance,
    tronValue: value,
    transactions: nativeTransactions,
    tokenTransactions,
    maxBlockTimestamp,
  };
}

export async function fetchAndParseTronWallet(address, options = {}) {
  const trimmed = (address || '').trim();
  if (!trimmed) throw new Error('Tron address is required');
  const trxPriceUsd = await getTrxUsd();
  let html;
  try {
    html = await fetchAddressPage(trimmed);
  } catch (e) {
    return emptyTronResult();
  }
  return parseAddressHtml(html, trimmed, trxPriceUsd);
}
