/**
 * Solana address data via scraping block explorer HTML (no RPC).
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { getSolUsd } from './priceService.js';
import { toAgeStringIST } from '../utils/dateIST.js';

const BASE = process.env.SOLANA_EXPLORER_BASE || 'https://explorer.solana.com';

const AXIOS_OPTS = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html',
  },
  timeout: 12000,
  validateStatus: (s) => s === 200 || s === 404,
};

function getBase() {
  const rpc = (process.env.SOL_RPC_URL || '').toLowerCase();
  if (rpc.includes('devnet')) return 'https://explorer.solana.com';
  if (rpc.includes('testnet')) return 'https://explorer.solana.com';
  return BASE;
}

export async function fetchAddressPage(address) {
  const base = getBase().replace(/\/$/, '');
  const cluster = (process.env.SOL_RPC_URL || '').toLowerCase().includes('devnet') ? '?cluster=devnet' : (process.env.SOL_RPC_URL || '').toLowerCase().includes('testnet') ? '?cluster=testnet' : '';
  const url = `${base}/address/${encodeURIComponent(address)}${cluster}`;
  const { data } = await axios.get(url, AXIOS_OPTS);
  return data;
}

function parseBalance($) {
  const text = $('body').text();
  const balanceMatch = text.match(/Balance[:\s]*(\d+(?:\.\d+)?)\s*SOL/i) || text.match(/(\d+(?:\.\d+)?)\s*SOL\s*balance/i);
  if (balanceMatch) return `${balanceMatch[1]} SOL`;
  const lamportsMatch = text.match(/(\d+)\s*lamports/i);
  if (lamportsMatch) {
    const lamports = parseInt(lamportsMatch[1], 10);
    const sol = lamports / 1e9;
    return `${sol} SOL`;
  }
  return '0 SOL';
}

function parseTransactions($, walletAddress, solPriceUsd = 0) {
  const transactions = [];
  const seen = new Set();
  $('a[href*="/tx/"], a[href*="signature="]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/\/tx\/([A-Za-z0-9]{87,88})/) || href.match(/signature=([A-Za-z0-9]{87,88})/);
    if (!match || seen.has(match[1])) return;
    seen.add(match[1]);
    const txHash = match[1];
    const $row = $(el).closest('tr, div').first();
    const rowText = $row.text();
    const amountMatch = rowText.match(/(\d+(?:\.\d+)?)\s*SOL/);
    const amountSol = amountMatch ? parseFloat(amountMatch[1]) : 0;
    const amountUsd = solPriceUsd > 0 && amountSol > 0 ? (amountSol * solPriceUsd).toFixed(2) : '';
    const slotMatch = rowText.match(/Slot[:\s]*(\d+)/i);
    const block = slotMatch ? slotMatch[1] : '';
    transactions.push({
      transactionHash: txHash,
      walletAddress,
      walletType: 'Solana',
      txType: 'sol',
      token: 'SOL',
      method: 'Transfer',
      block,
      age: '',
      from: '',
      to: '',
      inOut: 'ANY',
      amount: String(amountSol),
      amountUsd,
      txnFee: '',
      status: 'confirmed',
    });
  });
  return transactions;
}

export function parseAddressHtml(html, walletAddress, solPriceUsd = 0) {
  const $ = cheerio.load(html);
  const balance = parseBalance($);
  const balanceNum = parseFloat(balance) || 0;
  const value = solPriceUsd > 0 ? (balanceNum * solPriceUsd).toFixed(2) : '';
  const transactions = parseTransactions($, walletAddress, solPriceUsd);
  return { solBalance: balance, solValue: value, transactions };
}

export async function fetchAndParseSolWallet(address) {
  const trimmed = (address || '').trim();
  if (!trimmed) throw new Error('Solana address is required');
  const [html, solPriceUsd] = await Promise.all([
    fetchAddressPage(trimmed),
    getSolUsd(),
  ]);
  const out = parseAddressHtml(html, trimmed, solPriceUsd);
  return {
    ...out,
    tokenTransactions: [],
  };
}
