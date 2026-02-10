/**
 * Bitcoin address data via scraping Blockstream HTML (no API).
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { getBtcUsd } from './priceService.js';

const BASE = process.env.BLOCKSTREAM_BASE || 'https://blockstream.info';

const AXIOS_OPTS = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html',
  },
  timeout: 15000,
  validateStatus: (s) => s === 200 || s === 404,
};

function getBase() {
  const network = (process.env.BTC_NETWORK || 'mainnet').toLowerCase();
  if (network === 'testnet4') return 'https://mempool.space/testnet4';
  if (network === 'testnet') return 'https://blockstream.info/testnet';
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
  const unspentMatch = text.match(/Confirmed unspent[\s\S]*?(\d+(?:\.\d+)?)\s*BTC/i);
  if (unspentMatch) return `${unspentMatch[1]} BTC`;
  const receivedMatch = text.match(/Confirmed received[\s\S]*?(\d+(?:\.\d+)?)\s*BTC/i);
  if (receivedMatch) return `${receivedMatch[1]} BTC`;
  return '0 BTC';
}

function parseTransactions($, walletAddress, btcPriceUsd = 0) {
  const transactions = [];
  const base = getBase();
  const txLinks = $('a[href*="/tx/"]');
  const seen = new Set();
  txLinks.each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/\/tx\/([a-fA-F0-9]{64})/);
    if (!match || seen.has(match[1])) return;
    seen.add(match[1]);
    const txHash = match[1];
    const $parent = $(el).closest('tr, div, section').first();
    const blockText = $parent.text();
    const amountMatch = blockText.match(/(\d+(?:\.\d+)?)\s*BTC/);
    const amountBtc = amountMatch ? parseFloat(amountMatch[1]) : 0;
    const confirmMatch = blockText.match(/(\d+)\s*Confirmations/);
    const block = confirmMatch ? confirmMatch[1] : '';
    const isConfirmed = blockText.includes('Confirmation') && !blockText.includes('0 Confirmations');
    const ageStr = '';
    const amountUsd = btcPriceUsd > 0 && amountBtc > 0 ? (amountBtc * btcPriceUsd).toFixed(2) : '';
    const inOut = 'ANY';
    transactions.push({
      transactionHash: txHash,
      walletAddress,
      walletType: 'Bitcoin',
      txType: 'btc',
      token: 'BTC',
      method: 'Transfer',
      block,
      age: ageStr,
      from: '',
      to: '',
      inOut,
      amount: String(amountBtc),
      amountUsd,
      txnFee: '',
      status: isConfirmed ? 'confirmed' : 'pending',
    });
  });
  return transactions;
}

export function parseAddressHtml(html, walletAddress, btcPriceUsd = 0) {
  const $ = cheerio.load(html);
  const balance = parseBalance($);
  const balanceNum = parseFloat(balance) || 0;
  const value = btcPriceUsd > 0 ? (balanceNum * btcPriceUsd).toFixed(2) : '';
  const transactions = parseTransactions($, walletAddress, btcPriceUsd);
  return { btcBalance: balance, btcValue: value, transactions };
}

export async function fetchAndParseBtcWallet(address) {
  const trimmed = (address || '').trim();
  if (!trimmed) throw new Error('Bitcoin address is required');
  const [html, btcPriceUsd] = await Promise.all([
    fetchAddressPage(trimmed),
    getBtcUsd(),
  ]);
  const out = parseAddressHtml(html, trimmed, btcPriceUsd);
  return {
    ...out,
    tokenTransactions: [],
  };
}
