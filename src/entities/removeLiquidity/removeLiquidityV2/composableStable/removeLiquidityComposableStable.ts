import { insertIndex } from '@/utils';
import { encodeFunctionData } from 'viem';

import { vaultV2Abi } from '../../../../abi';
import { VAULT, ZERO_ADDRESS } from '../../../../utils/constants';
import { ComposableStableEncoder } from '../../../encoders/composableStable';
import { Token } from '../../../token';
import { TokenAmount } from '../../../tokenAmount';
import { PoolState } from '../../../types';
import {
    calculateProportionalAmounts,
    getPoolStateWithBalancesV2,
    getSortedTokens,
} from '../../../utils';
import { doRemoveLiquidityQuery } from '../../../utils/doRemoveLiquidityQuery';
import { parseRemoveLiquidityArgs } from '../../../utils/parseRemoveLiquidityArgs';
import { getAmountsCall, getAmountsQuery } from '../../helper';
import {
    RemoveLiquidityBase,
    RemoveLiquidityBuildCallOutput,
    RemoveLiquidityInput,
    RemoveLiquidityKind,
    RemoveLiquidityQueryOutput,
    RemoveLiquidityRecoveryInput,
} from '../../types';
import { RemoveLiquidityV2ComposableStableBuildCallInput } from './types';

export class RemoveLiquidityComposableStable implements RemoveLiquidityBase {
    public async query(
        input: RemoveLiquidityInput,
        poolState: PoolState,
    ): Promise<RemoveLiquidityQueryOutput> {
        if (input.kind === RemoveLiquidityKind.Recovery) {
            return this.queryRemoveLiquidityRecovery(input, poolState);
        }

        const sortedTokens = getSortedTokens(poolState.tokens, input.chainId);
        const bptIndex = poolState.tokens.findIndex(
            (t) => t.address === poolState.address,
        );
        const amounts = getAmountsQuery(sortedTokens, input, bptIndex);
        const amountsWithoutBpt = {
            ...amounts,
            minAmountsOut: [
                ...amounts.minAmountsOut.slice(0, bptIndex),
                ...amounts.minAmountsOut.slice(bptIndex + 1),
            ],
        };
        const userData = ComposableStableEncoder.encodeRemoveLiquidityUserData(
            input.kind,
            amountsWithoutBpt,
        );

        const { args, tokensOut } = parseRemoveLiquidityArgs({
            chainId: input.chainId,
            poolId: poolState.id,
            sortedTokens,
            sender: ZERO_ADDRESS,
            recipient: ZERO_ADDRESS,
            minAmountsOut: amounts.minAmountsOut,
            userData,
        });
        const queryOutput = await doRemoveLiquidityQuery(
            input.rpcUrl,
            input.chainId,
            args,
        );
        const bpt = new Token(input.chainId, poolState.address, 18);
        const bptIn = TokenAmount.fromRawAmount(bpt, queryOutput.bptIn);

        const amountsOut = queryOutput.amountsOut.map((a, i) =>
            TokenAmount.fromRawAmount(tokensOut[i], a),
        );

        return {
            to: VAULT[input.chainId],
            poolType: poolState.type,
            removeLiquidityKind: input.kind,
            poolId: poolState.id,
            bptIn,
            amountsOut,
            tokenOutIndex: amounts.tokenOutIndex,
            bptIndex,
            protocolVersion: poolState.protocolVersion,
            chainId: input.chainId,
        };
    }

    // RemoveLiquidityRecovery doesn't have a proper query method on v2, so
    // this method replicates SC behavior off-chain
    private async queryRemoveLiquidityRecovery(
        input: RemoveLiquidityRecoveryInput,
        poolState: PoolState,
    ): Promise<RemoveLiquidityQueryOutput> {
        const poolStateWithBalances = await getPoolStateWithBalancesV2(
            poolState,
            input.chainId,
            input.rpcUrl,
        );

        const { tokenAmounts } = calculateProportionalAmounts(
            poolStateWithBalances,
            input.bptIn,
        );

        const bptToken = new Token(input.chainId, poolState.address, 18);
        const bptIn = TokenAmount.fromRawAmount(
            bptToken,
            input.bptIn.rawAmount,
        );
        const bptIndex = poolState.tokens.findIndex(
            (t) => t.address === poolState.address,
        );
        let amountsOut = tokenAmounts.map((amount) =>
            TokenAmount.fromRawAmount(
                new Token(input.chainId, amount.address, amount.decimals),
                amount.rawAmount,
            ),
        );
        amountsOut = insertIndex(
            amountsOut,
            bptIndex,
            TokenAmount.fromRawAmount(bptToken, 0n),
        );
        return {
            to: VAULT[input.chainId],
            poolType: poolState.type,
            removeLiquidityKind: input.kind,
            poolId: poolState.id,
            bptIn,
            amountsOut,
            tokenOutIndex: undefined,
            protocolVersion: poolState.protocolVersion,
            chainId: input.chainId,
        };
    }

    public buildCall(
        input: RemoveLiquidityV2ComposableStableBuildCallInput,
    ): RemoveLiquidityBuildCallOutput {
        const amounts = getAmountsCall(input);
        const amountsWithoutBpt = {
            ...amounts,
            minAmountsOut: [
                ...amounts.minAmountsOut.slice(0, input.bptIndex),
                ...amounts.minAmountsOut.slice(input.bptIndex + 1),
            ],
        };
        const userData = ComposableStableEncoder.encodeRemoveLiquidityUserData(
            input.removeLiquidityKind,
            amountsWithoutBpt,
        );

        const { args } = parseRemoveLiquidityArgs({
            poolId: input.poolId,
            sortedTokens: input.amountsOut.map((a) => a.token),
            sender: input.sender,
            recipient: input.recipient,
            minAmountsOut: amounts.minAmountsOut,
            userData,
            toInternalBalance: !!input.toInternalBalance,
            wethIsEth: !!input.wethIsEth,
            chainId: input.chainId,
        });
        const callData = encodeFunctionData({
            abi: vaultV2Abi,
            functionName: 'exitPool',
            args,
        });

        return {
            args,
            callData,
            to: VAULT[input.chainId],
            value: 0n,
            maxBptIn: TokenAmount.fromRawAmount(
                input.bptIn.token,
                amounts.maxBptAmountIn,
            ),
            minAmountsOut: input.amountsOut.map((a, i) =>
                TokenAmount.fromRawAmount(a.token, amounts.minAmountsOut[i]),
            ),
        };
    }

    buildCallWithPermit(): RemoveLiquidityBuildCallOutput {
        throw new Error('buildCallWithPermit is not supported on v2');
    }
}
