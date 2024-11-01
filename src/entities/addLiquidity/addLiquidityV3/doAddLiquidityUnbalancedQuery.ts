import { createPublicClient, http, zeroAddress } from 'viem';
import { AddLiquidityUnbalancedInput } from '../types';
import { BALANCER_ROUTER, CHAINS } from '@/utils';
import {
    balancerRouterAbi,
    permit2Abi,
    vaultExtensionAbi_V3,
    vaultV3Abi,
} from '@/abi';
import { Address } from '@/types';

export const doAddLiquidityUnbalancedQuery = async (
    { rpcUrl, chainId }: AddLiquidityUnbalancedInput,
    poolAddress: Address,
    maxAmountsIn: bigint[],
) => {
    const client = createPublicClient({
        transport: http(rpcUrl),
        chain: CHAINS[chainId],
    });

    const { result: bptAmountOut } = await client.simulateContract({
        address: BALANCER_ROUTER[chainId],
        abi: [
            ...balancerRouterAbi,
            ...vaultV3Abi,
            ...vaultExtensionAbi_V3,
            ...permit2Abi,
        ],
        functionName: 'queryAddLiquidityUnbalanced',
        args: [poolAddress, maxAmountsIn, zeroAddress, '0x'],
    });
    return bptAmountOut;
};
