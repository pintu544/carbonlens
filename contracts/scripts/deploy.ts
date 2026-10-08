import { ethers } from "hardhat";

/**
 * Deploys CarbonLensRegistry to the configured network (Polygon Amoy).
 * Env: AMOY_RPC_URL, DEPLOYER_PRIVATE_KEY (testnet key only — never mainnet).
 * Prints the contract address: record it in server .env as CONTRACT_ADDRESS.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const address = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(address);
  console.log(`Deployer: ${address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} MATIC`);

  const factory = await ethers.getContractFactory("CarbonLensRegistry");
  const registry = await factory.deploy();
  await registry.waitForDeployment();
  const contractAddress = await registry.getAddress();

  console.log(`CarbonLensRegistry deployed to: ${contractAddress}`);
  const network = await ethers.provider.getNetwork();
  console.log(`Chain ID: ${network.chainId}`);
  if (network.chainId === 80002n) {
    console.log(`AmoyScan: https://amoy.polygonscan.com/address/${contractAddress}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
