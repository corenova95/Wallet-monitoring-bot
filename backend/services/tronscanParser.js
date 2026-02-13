/**
 * Tron address data via Tronscan HTML scraping only (no API/RPC).
 * Uses headless Selenium (Chrome) to avoid 403 scraping detection; falls back to empty result on error.
 */
import { Builder, Browser, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import * as cheerio from 'cheerio';
import { getTrxUsd } from './priceService.js';
import { toAgeStringIST } from '../utils/dateIST.js';

const BASE = process.env.TRONSCAN_BASE || 'https://tronscan.org';

/** Lazy headless Chrome driver; one fetch at a time via mutex. */
let _driver = null;
let _driverPromise = null;
let _fetchMutex = Promise.resolve();

async function getDriver() {
  if (_driver) return _driver;
  if (_driverPromise) return _driverPromise;
  const options = new chrome.Options()
    .addArguments(
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--lang=en-US'
    )
    .windowSize({ width: 1920, height: 1080 });
  _driverPromise = new Builder()
    .forBrowser(Browser.CHROME)
    .setChromeOptions(options)
    .build();
  _driver = await _driverPromise;
  return _driver;
}

/** Call when shutting down (e.g. tests) so the process can exit. */
export async function closeTronBrowser() {
  if (_driver) {
    try {
      await _driver.quit();
    } catch (_) {}
    _driver = null;
    _driverPromise = null;
  }
}

async function withFetchMutex(fn) {
  const waitFor = _fetchMutex;
  let resolve;
  _fetchMutex = new Promise((r) => { resolve = r; });
  await waitFor;
  try {
    return await fn();
  } finally {
    resolve();
  }
}

/**
 * Fetch Tronscan address page HTML using headless Chrome (avoids 403 from direct HTTP).
 */
async function fetchAddressPageWithBrowser(address) {
  return withFetchMutex(async () => {
    const driver = await getDriver();
    const base = BASE.replace(/\/$/, '');
    const url = `${base}/address/${encodeURIComponent(address)}`;
    await driver.get(url);
    await driver.wait(
      until.elementLocated(By.xpath("//*[contains(., 'TRX') or contains(., 'Balance') or contains(., 'Transaction')]")),
      15000
    ).catch(() => null);
    await new Promise((r) => setTimeout(r, 4000));
    return await driver.getPageSource();
  });
}

function emptyTronResult() {
  return {
    tronBalance: '0 TRX',
    tronValue: '',
    transactions: [],
    tokenTransactions: [],
    maxBlockTimestamp: null,
  };
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
    html = await fetchAddressPageWithBrowser(trimmed);
  } catch (e) {
    return emptyTronResult();
  }
  return parseAddressHtml(html, trimmed, trxPriceUsd);
}
