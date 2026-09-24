import { NextResponse } from "next/server";
import { prepareRetrieve } from "@/lib/nova";

// POST /api/plugins/agentic-economy-oracle/nova-contributions/prepare-retrieve
// Body: { ipfs_hash: string }
//
// Brokers the material the BROWSER needs to decrypt + verify one contribution:
// the wrapped key, the ciphertext (encrypted_b64), and the format descriptor.
// The server sees ciphertext + wrapped key only — it never decrypts, never sees
// plaintext. Decrypt + hash happen in the browser (lib/nova-decode.ts), which is
// the privacy property this whole path exists to preserve.
//
// POST (not GET) because it triggers a NOVA retrieve — a real upstream action
// with a cost — and takes a body. It's still read-only w.r.t. NOVA state.

export async function POST(request: Request) {
  let ipfsHash: string;
  try {
    const body = (await request.json()) as { ipfs_hash?: unknown };
    if (typeof body.ipfs_hash !== "string" || body.ipfs_hash.length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid 'ipfs_hash' in request body" },
        { status: 400 }
      );
    }
    ipfsHash = body.ipfs_hash;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const material = await prepareRetrieve(ipfsHash);
    return NextResponse.json(material);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // NOVA retrieve failed (down, auth, tombstoned, or unknown hash) → 502 with
    // the real message. The browser treats a failed prepare as "cannot verify".
    return NextResponse.json({ error: message }, { status: 502 });
  }
}