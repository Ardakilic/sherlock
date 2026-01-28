/**
 * Node.js proxy bootstrap script for Sherlock.
 * This script is loaded via NODE_OPTIONS="--require" to intercept HTTP calls.
 *
 * We intercept at multiple levels:
 * 1. Override globalThis.fetch with proxy-aware version (for Node's native fetch AND app fetch)
 * 2. Setup global-agent for http/https modules (for axios, node-fetch, etc.)
 */

const proxyUrl = process.env.SHERLOCK_PROXY_URL;
const debug = process.env.SHERLOCK_DEBUG === '1';

if (proxyUrl) {
  // Parse proxy URL
  const proxyUrlObj = new URL(proxyUrl);

  // 1. Setup global-agent for http/https modules
  try {
    require('global-agent/bootstrap');
    if (debug) console.error('[Sherlock] Proxy configured via global-agent (http/https)');
  } catch (e) {
    if (debug) console.error('[Sherlock] global-agent not available:', e.message);
  }

  // 2. Override globalThis.fetch with proxy-aware version
  // This intercepts ALL fetch calls, including from bundled undici
  try {
    const { ProxyAgent, fetch: undiciFetch } = require('undici');
    const proxyAgent = new ProxyAgent(proxyUrl);

    // Store original fetch
    const originalFetch = globalThis.fetch;

    // Replace global fetch with proxy-aware version
    globalThis.fetch = function(url, options = {}) {
      // Use our proxy agent dispatcher
      const newOptions = {
        ...options,
        dispatcher: proxyAgent,
      };

      if (debug) {
        const urlStr = typeof url === 'string' ? url : url.toString();
        console.error(`[Sherlock] Intercepting fetch: ${urlStr}`);
      }

      return undiciFetch(url, newOptions);
    };

    if (debug) console.error('[Sherlock] Proxy configured via fetch override (undici ProxyAgent)');
  } catch (e) {
    if (debug) console.error('[Sherlock] Could not override fetch:', e.message);

    // Fallback: try to use EnvHttpProxyAgent for undici's native support
    try {
      const { EnvHttpProxyAgent, setGlobalDispatcher } = require('undici');
      setGlobalDispatcher(new EnvHttpProxyAgent());
      if (debug) console.error('[Sherlock] Proxy configured via undici EnvHttpProxyAgent');
    } catch (e2) {
      if (debug) console.error('[Sherlock] undici EnvHttpProxyAgent not available');
    }
  }
}
