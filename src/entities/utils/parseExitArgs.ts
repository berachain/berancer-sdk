import { Address } from '../../types';
import { Token } from '../token';
import { ExitPoolRequest } from '../exit/types';
import { replaceWrapped } from './replaceWrapped';

export function parseExitArgs({
    chainId,
    exitWithNativeAsset,
    sortedTokens,
    poolId,
    sender,
    recipient,
    minAmountsOut,
    userData,
    toInternalBalance,
}: {
    chainId?: number;
    exitWithNativeAsset?: boolean;
    sortedTokens: Token[];
    poolId: Address;
    sender: Address;
    recipient: Address;
    minAmountsOut: bigint[];
    userData: Address;
    toInternalBalance: boolean;
}) {
    // replace wrapped token with native asset if needed
    const tokensOut =
        chainId && exitWithNativeAsset
            ? replaceWrapped([...sortedTokens], chainId)
            : [...sortedTokens];

    const exitPoolRequest: ExitPoolRequest = {
        assets: tokensOut.map((t) => t.address), // with BPT
        minAmountsOut, // with BPT
        userData, // wihtout BPT
        toInternalBalance,
    };

    return {
        args: [poolId, sender, recipient, exitPoolRequest] as const,
        tokensOut,
    };
}
