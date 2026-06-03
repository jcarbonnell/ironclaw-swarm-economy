// tests/test_nova_retrieve.mjs
// ----------------------------
// Retrieve and decrypt a file uploaded by the nova-submit WASM tool.
// Tests that the NOVA testnet IPFS storage is real and that the group
// owner account can decrypt contributions from swarm agents.
//
// Usage:
//   npm install nova-sdk-js   (once, from repo root or tests/)
//   node tests/test_nova_retrieve.mjs
//
// Replace API_KEY with a fresh key from testnet.nova-sdk.com before running.

import { NovaSdk } from 'nova-sdk-js';

const API_KEY    = 'your_nova_api_key_here';
const ACCOUNT_ID = 'ironclaw-swarm.nova-sdk-6.testnet';
const GROUP_ID   = 'ironclaw-swarm-economy';
const CID        = 'Qmd4e01b1a2d7995ef20b3c6e53bc4123c96f7d0f67e5f';  // agent1 round 1

async function main() {
  console.log('🔍 NOVA retrieve test (testnet)\n');

  const sdk = new NovaSdk(ACCOUNT_ID, {
    apiKey:     API_KEY,
    rpcUrl:     'https://rpc.testnet.near.org',
    contractId: 'nova-sdk-6.testnet',
  });

  console.log(`   Account:  ${sdk.accountId}`);
  console.log(`   Group:    ${GROUP_ID}`);
  console.log(`   CID:      ${CID}\n`);

  const r = await sdk.retrieve(GROUP_ID, CID);
  const text = r.data.toString('utf-8');

  console.log(`   ✅ Retrieved ${r.data.length} bytes\n`);
  console.log('DECRYPTED CONTENT (first 500 chars):');
  console.log(text.slice(0, 500));

  // Validate it looks like a graph JSON
  try {
    const parsed = JSON.parse(text);
    if (parsed.nodes && parsed.links) {
      console.log('\n🎉 TESTNET ROUND-TRIP CONFIRMED.');
      console.log(`   Nodes: ${parsed.nodes.length} | Links: ${parsed.links.length}`);
      console.log(`   Host agent: ${parsed.graph?.host_agent_id}`);
      console.log(`   Round: ${parsed.graph?.round}`);
    } else {
      console.log('\n⚠️  Retrieved content is JSON but not a graph — check CID.');
    }
  } catch {
    console.log('\n⚠️  Content is not JSON — may be raw text or wrong CID.');
  }
}

main().catch(e => {
  console.error('\n💥 Failed:', e.message);
  if (e.cause) console.error('   Cause:', e.cause);
  process.exit(1);
});
