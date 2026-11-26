const bybit = 'https://api.bybit.com/v5/market/';
const okx = 'https://www.okx.com/api/v5/';
const bitfinex = 'https://api-pub.bitfinex.com/v2/';
const hyperliquid = 'https://api.hyperliquid.xyz/info';
const mexc = 'https://contract.mexc.com/api/v1/contract/';
const target = (venue, market, kind, url, body) => ({ venue, market, kind, url, body });
export const endpoints = [
  ...['spot', 'linear'].map(category => target('bybit', category === 'spot' ? 'spot' : 'perp', 'trades',
    bybit + 'recent-trade?symbol=BTCUSDT&limit=5&category=' + category)),
  target('bybit', 'perp', 'oi', bybit + 'open-interest?category=linear&symbol=BTCUSDT&intervalTime=5min&limit=1'),
  target('bybit', 'perp', 'funding', bybit + 'tickers?category=linear&symbol=BTCUSDT'),
  ...['BTC-USDT', 'BTC-USDT-SWAP'].map(id => target('okx', id.endsWith('SWAP') ? 'perp' : 'spot', 'trades',
    okx + 'market/trades?limit=5&instId=' + id)),
  target('okx', 'perp', 'oi', okx + 'public/open-interest?instType=SWAP&instId=BTC-USDT-SWAP'),
  target('okx', 'perp', 'funding', okx + 'public/funding-rate?instId=BTC-USDT-SWAP'),
  target('okx', 'perp', 'contract', okx + 'public/instruments?instType=SWAP&instId=BTC-USDT-SWAP'),
  ...['tBTCUSD', 'tBTCF0:USTF0'].map(id => target('bitfinex', id.includes('F0') ? 'perp' : 'spot', 'trades',
    bitfinex + 'trades/' + id + '/hist?limit=5')),
  target('bitfinex', 'perp', 'oi-funding', bitfinex + 'status/deriv?keys=tBTCF0%3AUSTF0'),
  target('hyperliquid', 'spot', 'spot-meta', hyperliquid, { type: 'spotMeta' }),
  target('hyperliquid', 'spot', 'trades', hyperliquid, { type: 'recentTrades' }),
  target('hyperliquid', 'perp', 'trades', hyperliquid, { type: 'recentTrades', coin: 'BTC' }),
  target('hyperliquid', 'perp', 'oi-funding', hyperliquid, { type: 'metaAndAssetCtxs' }),
  target('mexc', 'spot', 'trades', 'https://api.mexc.com/api/v3/trades?symbol=BTCUSDT&limit=5'),
  target('mexc', 'perp', 'trades', mexc + 'deals/BTC_USDT'),
  target('mexc', 'perp', 'oi', mexc + 'ticker?symbol=BTC_USDT'),
  target('mexc', 'perp', 'funding', mexc + 'funding_rate/BTC_USDT'),
  target('mexc', 'perp', 'contract', mexc + 'detail?symbol=BTC_USDT'),
];
