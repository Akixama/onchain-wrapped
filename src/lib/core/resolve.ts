import { isEvmAddress, isSolanaAddress, normalizeAddress } from "./identity";
import type { ChainFamily } from "./types";

// Turn what the user typed ("vitalik.eth, toly.sol 0xabc...") into a deduped list of addresses.
// ENS: viem against a public Ethereum node. SNS: Bonfida SDK against public Solana RPC.

export const MAX_WALLETS = Number(process.env.MAX_WALLETS_PER_LOOKUP ?? 6);

export interface ResolvedWallet {
  input: string;
  address: string;
  family: ChainFamily;
  name?: string; // the ENS / SNS name, when one was typed
}

export class InputError extends Error {}

const ETH_RPC = () => process.env.ETH_RPC_URL ?? "https://ethereum-rpc.publicnode.com";
const SOL_RPC = () => process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

export function splitInput(raw: string | string[]): string[] {
  const parts = (Array.isArray(raw) ? raw : [raw]).flatMap((s) => s.split(/[\s,;]+/)).map((s) => s.trim()).filter(Boolean);
  return [...new Set(parts)];
}

const isSnsName = (s: string) => /^[a-z0-9-_.]+\.(sol|sns)$/i.test(s);
const isEnsName = (s: string) => /^[^\s]+\.[a-z0-9]+$/i.test(s) && !isSnsName(s);

async function resolveEns(name: string): Promise<string | null> {
  const { createPublicClient, http } = await import("viem");
  const { mainnet } = await import("viem/chains");
  const { normalize } = await import("viem/ens");
  const client = createPublicClient({ chain: mainnet, transport: http(ETH_RPC(), { timeout: 15_000 }) });
  const addr = await client.getEnsAddress({ name: normalize(name) });
  return addr ? addr.toLowerCase() : null;
}

async function resolveSns(name: string): Promise<string | null> {
  const { Connection } = await import("@solana/web3.js");
  const sns = await import("@bonfida/spl-name-service");
  // SNS moved .sol names to the .sns TLD; the SDK paused direct .sol lookups. Same name, new suffix.
  const domain = name.toLowerCase().replace(/\.sol$/, ".sns");
  try {
    return (await sns.resolve(new Connection(SOL_RPC()), domain)).toBase58();
  } catch (e) {
    if (/does not exist|DomainDoesNotExist|AccountDoesNotExist/i.test(String((e as Error).message ?? e))) return null;
    throw e;
  }
}

export async function resolveWallets(raw: string | string[]): Promise<ResolvedWallet[]> {
  const inputs = splitInput(raw);
  if (!inputs.length) throw new InputError("Paste at least one wallet address or name.");
  if (inputs.length > MAX_WALLETS) throw new InputError(`Up to ${MAX_WALLETS} wallets per lookup.`);

  const out = await Promise.all(
    inputs.map(async (input): Promise<ResolvedWallet> => {
      if (isEvmAddress(input)) return { input, address: normalizeAddress(input), family: "evm" };
      if (isSolanaAddress(input)) return { input, address: input, family: "solana" };
      if (isSnsName(input)) {
        const address = await resolveSns(input).catch(() => {
          throw new InputError(`Couldn't look up ${input} right now. Try the address instead.`);
        });
        if (!address) throw new InputError(`${input} isn't registered.`);
        return { input, address, family: "solana", name: input.toLowerCase() };
      }
      if (isEnsName(input)) {
        const address = await resolveEns(input).catch(() => {
          throw new InputError(`Couldn't look up ${input} right now. Try the address instead.`);
        });
        if (!address) throw new InputError(`${input} doesn't point to a wallet.`);
        return { input, address, family: "evm", name: input.toLowerCase() };
      }
      throw new InputError(`"${input}" isn't a Solana/EVM address, ENS name or .sol name.`);
    }),
  );
  // Two names can point at the same wallet: keep the first.
  return [...new Map(out.map((w) => [w.address, w])).values()];
}
