// orchestrator/pull_graphs.mjs
// ----------------------------
// Lists all transactions in the ironclaw-swarm-economy NOVA group,
// retrieves and decrypts each graph JSON, and writes them to
// orchestrator/data/graphs/ for the GNN training script.
//
// Skips CIDs already present in the registry (incremental pulls).
// Skips legacy Markdown payloads from skill v0.1.0.
//
// Usage (from repo root):
//   node orchestrator/pull_graphs.mjs
//
// Credentials are read from orchestrator/.env

import { NovaSdk } from 'nova-sdk-js';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';

// Load .env before reading any process.env values
config({ path: resolve('orchestrator/.env') });

// ── Config (read after dotenv) ────────────────────────────────────────────────

const ACCOUNT_ID = process.env.NOVA_ACCOUNT_ID || 'ironclaw-swarm.nova-sdk-6.testnet';
const API_KEY    = process.env.NOVA_API_KEY;
const GROUP_ID   = process.env.NOVA_GROUP_ID   || 'ironclaw-swarm-economy';

const NOVA_AUTH_URL = 'https://nova-sdk.com/api/auth/session-token';
const NOVA_MCP_BASE = 'https://5a5223f7d1bfe777433c496b9d52ff851e927259-8000.dstack-prod5.phala.network';

const GRAPHS_DIR    = resolve('orchestrator/data/graphs');
const REGISTRY_FILE = resolve('orchestrator/data/pull_registry.json');

// ── Guards ────────────────────────────────────────────────────────────────────

if (!API_KEY) {
  console.error('❌ NOVA_API_KEY is not set in orchestrator/.env');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getSessionToken() {
  const res = await fetch(NOVA_AUTH_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
    body:    JSON.stringify({ account_id: ACCOUNT_ID }),
  });
  if (!res.ok) throw new Error(`session-token HTTP ${res.status}: ${await res.text()}`);
  const j = await res.json();
  if (!j.token) throw new Error('no token in session-token response');
  return j.token;
}

async function getGroupTransactions(token) {
  const res = await fetch(`${NOVA_MCP_BASE}/tools/get_group_transactions`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
      'x-account-id':  ACCOUNT_ID,
      'x-wallet-id':   ACCOUNT_ID,
    },
    body: JSON.stringify({ group_id: GROUP_ID }),
  });
  if (!res.ok) throw new Error(`get_group_transactions HTTP ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.result ?? j;
}

function loadRegistry() {
  if (existsSync(REGISTRY_FILE)) {
    return new Set(JSON.parse(readFileSync(REGISTRY_FILE, 'utf-8')));
  }
  return new Set();
}

function saveRegistry(pulled) {
  writeFileSync(REGISTRY_FILE, JSON.stringify([...pulled], null, 2));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔗 NOVA Graph Pull — ' + GROUP_ID + '\n');

  mkdirSync(GRAPHS_DIR, { recursive: true });
  mkdirSync(resolve('orchestrator/data'), { recursive: true });

  const pulled = loadRegistry();

  const sdk = new NovaSdk(ACCOUNT_ID, {
    apiKey:     API_KEY,
    rpcUrl:     'https://rpc.testnet.near.org',
    contractId: 'nova-sdk-6.testnet',
  });

  console.log(`   Account:  ${ACCOUNT_ID}`);
  console.log(`   Group:    ${GROUP_ID}`);
  console.log(`   Already pulled: ${pulled.size} CID(s)\n`);

  // 1. List group transactions
  console.log('📋 Fetching group transaction log...');
  const token = await getSessionToken();
  const txs   = await getGroupTransactions(token);
  console.log(`   Found ${txs.length} total contribution(s)`);

  const newTxs = txs.filter(tx => !pulled.has(tx.ipfs_hash));
  console.log(`   New (not yet pulled): ${newTxs.length}\n`);

  if (newTxs.length === 0) {
    console.log('✓ Nothing new to pull. Run train_oracle.py to train on existing graphs.');
    return;
  }

  // 2. Retrieve + decrypt each new contribution
  const results = { success: 0, skipped: 0, failed: 0, files: [] };

  for (let i = 0; i < newTxs.length; i++) {
    const tx    = newTxs[i];
    const label = `[${i + 1}/${newTxs.length}] ${tx.ipfs_hash}`;

    try {
      console.log(`   Retrieving ${label}`);
      const r    = await sdk.retrieve(GROUP_ID, tx.ipfs_hash);
      const text = r.data.toString('utf-8');

      // Validate it's a graph JSON
      let graph;
      try {
        graph = JSON.parse(text);
      } catch {
        pulled.add(tx.ipfs_hash);
        results.skipped++;
        console.log(`   ⚠  Skipped (legacy payload — not JSON)`);
        continue;
      }

      if (!graph.nodes || !graph.links) {
        pulled.add(tx.ipfs_hash);
        results.skipped++;
        console.log(`   ⚠  Skipped (legacy payload — not a graph)`);
        continue;
      }

      // Write to graphs directory
      const uploader = (tx.user_id || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
      const fname    = `${uploader}__${tx.ipfs_hash.slice(0, 16)}.json`;
      const fpath    = resolve(GRAPHS_DIR, fname);
      writeFileSync(fpath, text);

      pulled.add(tx.ipfs_hash);
      results.success++;
      results.files.push(fname);

      console.log(`   ✅ ${graph.graph?.host_agent_id} | round=${graph.graph?.round} | nodes=${graph.nodes.length} | links=${graph.links.length}`);

    } catch (e) {
      console.log(`   ❌ Failed: ${e.message}`);
      results.failed++;
    }
  }

  // 3. Save registry
  saveRegistry(pulled);

  // 4. Summary
  console.log('\n' + '═'.repeat(50));
  console.log('Pull complete');
  console.log(`  ✅ Success: ${results.success}`);
  console.log(`  ⚠  Skipped: ${results.skipped}`);
  console.log(`  ❌ Failed:  ${results.failed}`);
  console.log(`  Total in registry: ${pulled.size}`);
  console.log(`  Graphs dir: ${GRAPHS_DIR}`);
  console.log('═'.repeat(50));

  const manifest = {
    pulled_at:    new Date().toISOString(),
    total_graphs: pulled.size,
    new_graphs:   results.files,
    graphs_dir:   GRAPHS_DIR,
  };
  writeFileSync(resolve('orchestrator/data/manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('\n✓ Manifest written → orchestrator/data/manifest.json');
  console.log('  Next: python3 orchestrator/train_oracle.py\n');
}

main().catch(e => {
  console.error('\n💥 Fatal:', e.message);
  if (e.cause) console.error('   Cause:', e.cause);
  process.exit(1);
});