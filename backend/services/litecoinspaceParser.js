/**
 * Litecoin address data via scraping block explorer HTML (no API).
 * Uses Blockchair Litecoin (server-rendered) or same pattern as Blockstream.
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { getLtcUsd } from './priceService.js';

const BASE = process.env.LITECOIN_EXPLORER_BASE || 'https://blockchair.com/litecoin';

const AXIOS_OPTS = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html',
  },
  timeout: 15000,
  validateStatus: (s) => s === 200 || s === 404,
};

function getBase() {
  const network = (process.env.LTC_NETWORK || 'mainnet').toLowerCase();
  if (network === 'testnet') return 'https://blockchair.com/litecoin/testnet';
  return BASE;
}

export async function fetchAddressPage(address) {
  const base = getBase();
  const url = `${base}/address/${encodeURIComponent(address)}`;
  const { data } = await axios.get(url, AXIOS_OPTS);
  return data;
}

function parseBalance($) {
  const text = $('body').text();
  const balanceMatch = text.match(/Balance[:\s]*(\d+(?:\.\d+)?)\s*LTC/i) || text.match(/(\d+(?:\.\d+)?)\s*LTC\s*balance/i);
  if (balanceMatch) return `${balanceMatch[1]} LTC`;
  const receivedMatch = text.match(/Received[:\s]*(\d+(?:\.\d+)?)\s*LTC/i);
  if (receivedMatch) return `${receivedMatch[1]} LTC`;
  return '0 LTC';
}

function parseTransactions($, walletAddress, ltcPriceUsd = 0) {
  const transactions = [];
  const txLinks = $('a[href*="/litecoin/transaction/"], a[href*="/transaction/"]');
  const seen = new Set();
  txLinks.each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/\/transaction\/([a-fA-F0-9]{64})/);
    if (!match || seen.has(match[1])) return;
    seen.add(match[1]);
    const txHash = match[1];
    const $row = $(el).closest('tr, div').first();
    const rowText = $row.text();
    const amountMatch = rowText.match(/(\d+(?:\.\d+)?)\s*LTC/);
    const amountLtc = amountMatch ? parseFloat(amountMatch[1]) : 0;
    const amountUsd = ltcPriceUsd > 0 && amountLtc > 0 ? (amountLtc * ltcPriceUsd).toFixed(2) : '';
    transactions.push({
      transactionHash: txHash,
      walletAddress,
      walletType: 'Litecoin',
      txType: 'ltc',
      token: 'LTC',
      method: 'Transfer',
      block: '',
      age: '',
      from: '',
      to: '',
      inOut: 'ANY',
      amount: String(amountLtc),
      amountUsd,
      txnFee: '',
      status: 'confirmed',
    });
  });
  return transactions;
}

export function parseAddressHtml(html, walletAddress, ltcPriceUsd = 0) {
  const $ = cheerio.load(html);
  const balance = parseBalance($);
  const balanceNum = parseFloat(balance) || 0;
  const value = ltcPriceUsd > 0 ? (balanceNum * ltcPriceUsd).toFixed(2) : '';
  const transactions = parseTransactions($, walletAddress, ltcPriceUsd);
  return { ltcBalance: balance, ltcValue: value, transactions };
}

export async function fetchAndParseLtcWallet(address) {
  const trimmed = (address || '').trim();
  if (!trimmed) throw new Error('Litecoin address is required');
  const [html, ltcPriceUsd] = await Promise.all([
    fetchAddressPage(trimmed),
    getLtcUsd(),
  ]);
  const out = parseAddressHtml(html, trimmed, ltcPriceUsd);
  return {
    ...out,
    tokenTransactions: [],
  };
}
