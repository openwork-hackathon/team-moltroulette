import { ethers } from 'ethers';

/**
 * Create $MOLT token on Base via Mint Club V2
 * 
 * This script calls MCV2_Bond.createToken() to deploy the MoltRoulette token
 * with a 3-step bonding curve backed by $OPENWORK.
 * 
 * Prerequisites:
 * - PRIVATE_KEY environment variable set
 * - Base RPC URL (defaults to public endpoint)
 * - Sufficient ETH for gas on Base
 * - $OPENWORK tokens for initial reserve (optional, curve starts from 0)
 */

// Contract addresses on Base
const MCV2_BOND = '0xc5a076cad94176c2996B32d8466Be1cE757FAa27';
const MCV2_TOKEN = '0xAa70bC79fD1cB4a6FBA717018351F0C3c64B79Df';
const OPENWORK_TOKEN = '0x299c30DD5974BF4D5bFE42C340CA40462816AB07';

// Token parameters
const TOKEN_SYMBOL = 'MOLT';
const TOKEN_NAME = 'MoltRoulette Token';
const MAX_SUPPLY = ethers.parseEther('1000000'); // 1,000,000 tokens

// Bonding curve steps (3-step curve)
// Step 1: 0-100k at 0.001 OPENWORK each
// Step 2: 100k-500k at 0.005 OPENWORK each  
// Step 3: 500k-1M at 0.01 OPENWORK each
const STEPS = [
  ethers.parseEther('100000'),  // 100,000 tokens
  ethers.parseEther('500000'),  // 500,000 tokens
  ethers.parseEther('1000000')  // 1,000,000 tokens (max)
];

const PRICES = [
  ethers.parseEther('0.001'),   // 0.001 OPENWORK
  ethers.parseEther('0.005'),   // 0.005 OPENWORK
  ethers.parseEther('0.01')     // 0.01 OPENWORK
];

// Royalties (in basis points: 100 = 1%)
const MINT_ROYALTY = 100;  // 1%
const BURN_ROYALTY = 100;  // 1%

// MCV2_Bond ABI (minimal, just createToken function)
const MCV2_BOND_ABI = [
  'function createToken(string symbol, string name, address reserveToken, uint256 maxSupply, uint256[] stepRanges, uint256[] stepPrices, address creator, uint16 mintRoyalty, uint16 burnRoyalty) returns (address)'
];

async function main() {
  // Check for private key
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ Error: PRIVATE_KEY environment variable not set');
    console.log('\nUsage:');
    console.log('  PRIVATE_KEY=0x... npm run create-token');
    process.exit(1);
  }

  // Setup provider and signer
  const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  
  console.log('🚀 MoltRoulette Token Creation');
  console.log('═══════════════════════════════════════\n');
  console.log(`Network: Base`);
  console.log(`Deployer: ${wallet.address}`);
  
  // Check balance
  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
  
  if (balance === 0n) {
    console.error('\n❌ Error: Deployer has no ETH for gas');
    process.exit(1);
  }

  console.log('\n📋 Token Parameters');
  console.log('───────────────────────────────────────');
  console.log(`Symbol: ${TOKEN_SYMBOL}`);
  console.log(`Name: ${TOKEN_NAME}`);
  console.log(`Reserve Token: ${OPENWORK_TOKEN} ($OPENWORK)`);
  console.log(`Max Supply: ${ethers.formatEther(MAX_SUPPLY)}`);
  console.log(`Mint Royalty: ${MINT_ROYALTY / 100}%`);
  console.log(`Burn Royalty: ${BURN_ROYALTY / 100}%`);
  
  console.log('\n📈 Bonding Curve (3-step)');
  console.log('───────────────────────────────────────');
  console.log(`Step 1: 0 - ${ethers.formatEther(STEPS[0])} @ ${ethers.formatEther(PRICES[0])} OPENWORK`);
  console.log(`Step 2: ${ethers.formatEther(STEPS[0])} - ${ethers.formatEther(STEPS[1])} @ ${ethers.formatEther(PRICES[1])} OPENWORK`);
  console.log(`Step 3: ${ethers.formatEther(STEPS[1])} - ${ethers.formatEther(STEPS[2])} @ ${ethers.formatEther(PRICES[2])} OPENWORK`);

  // Connect to MCV2_Bond contract
  const bondContract = new ethers.Contract(MCV2_BOND, MCV2_BOND_ABI, wallet);

  console.log('\n⏳ Creating token...');
  console.log('───────────────────────────────────────');

  try {
    // Call createToken
    const tx = await bondContract.createToken(
      TOKEN_SYMBOL,
      TOKEN_NAME,
      OPENWORK_TOKEN,
      MAX_SUPPLY,
      STEPS,
      PRICES,
      wallet.address,  // creator (receives royalties)
      MINT_ROYALTY,
      BURN_ROYALTY
    );

    console.log(`Transaction submitted: ${tx.hash}`);
    console.log('Waiting for confirmation...');

    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed in block ${receipt.blockNumber}`);

    // Parse logs to find token address
    // The MCV2_Token contract emits a TokenCreated event with the token address
    // For simplicity, we'll calculate it or parse from logs
    // The token address can also be queried from MCV2_Token factory
    
    console.log('\n🎉 Token Created Successfully!');
    console.log('═══════════════════════════════════════');
    console.log(`Transaction: ${tx.hash}`);
    console.log(`Block: ${receipt.blockNumber}`);
    console.log(`Gas Used: ${receipt.gasUsed.toString()}`);
    
    console.log('\n📝 Next Steps:');
    console.log('1. Find the token address in the transaction logs');
    console.log('2. Update docs/token-plan.md with the token address');
    console.log('3. Add TOKEN_ADDRESS to environment variables');
    console.log('4. View token at: https://mint.club/token/base/MOLT');
    console.log(`5. View transaction: https://basescan.org/tx/${tx.hash}`);
    
    console.log('\n💡 To extract token address from logs:');
    console.log(`   Visit https://basescan.org/tx/${tx.hash}`);
    console.log('   Look for "TokenCreated" event in the logs tab');

  } catch (error) {
    console.error('\n❌ Error creating token:');
    console.error(error.message);
    
    if (error.reason) {
      console.error(`Reason: ${error.reason}`);
    }
    
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });