// Token supply straight from the chain, so every trade card can show market cap
// (price x supply) even when no chart service has the token.
import type { ChainId } from "./core/types";
import { fetchJson } from "./infra/http";
import { solanaTokenSupply } from "./chains/solana-rpc";

const EVM_RPC: Partial<Record<ChainId, string>> = {
  ethereum: "https://ethereum-rpc.publicnode.com",
  base: "https://base-rpc.publicnode.com",
  arbitrum: "https://arbitrum-one-rpc.publicnode.com",
  bsc: "https://bsc-rpc.publicnode.com",
  polygon: "https://polygon-bor-rpc.publicnode.com",
  optimism: "https://optimism-rpc.publicnode.com",
};

async function ethCall(chain: ChainId, to: string, data: string): Promise<bigint | null> {
  const url = EVM_RPC[chain];
  if (!url) return null;
  const r = await fetchJson<{ result?: string }>("evm-rpc", url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
    endpoint: "eth_call",
  }, 1);
  return r.result && r.result !== "0x" ? BigInt(r.result) : null;
}

export async function tokenSupply(chain: ChainId, address: string, decimals?: number): Promise<number | null> {
  if (address === "native") return null;
  try {
    if (chain === "solana") return await solanaTokenSupply(address);
    const [total, dec] = await Promise.all([
      ethCall(chain, address, "0x18160ddd"), // totalSupply()
      decimals !== undefined ? Promise.resolve(BigInt(decimals)) : ethCall(chain, address, "0x313ce567"), // decimals()
    ]);
    if (total === null || dec === null) return null;
    const s = Number(total) / 10 ** Number(dec);
    return s > 0 && Number.isFinite(s) ? s : null;
  } catch {
    return null;
  }
}
