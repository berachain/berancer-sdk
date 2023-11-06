// pnpm test -- weightedJoin.integration.test.ts
import { describe, test, beforeAll, beforeEach } from 'vitest';
import dotenv from 'dotenv';
dotenv.config();

import {
    createTestClient,
    http,
    parseUnits,
    publicActions,
    walletActions,
} from 'viem';

import {
    UnbalancedJoinInput,
    ProportionalJoinInput,
    SingleAssetJoinInput,
    JoinKind,
    Slippage,
    Token,
    TokenAmount,
    Address,
    Hex,
    PoolStateInput,
    CHAINS,
    ChainId,
    getPoolAddress,
    PoolJoin,
    JoinInput,
} from '../src';
import { forkSetup } from './lib/utils/helper';
import {
    assertProportionalJoin,
    assertSingleTokenJoin,
    assertUnbalancedJoin,
    doJoin,
} from './lib/utils/joinHelper';
import { JoinTxInput } from './lib/utils/types';

const chainId = ChainId.MAINNET;
const rpcUrl = 'http://127.0.0.1:8545/';
const poolId =
    '0x68e3266c9c8bbd44ad9dca5afbfe629022aee9fe000200000000000000000512'; // 80wjAURA-20WETH

describe('weighted join test', () => {
    let txInput: JoinTxInput;
    let bptToken: Token;

    beforeAll(async () => {
        // setup mock api
        const api = new MockApi();

        // get pool state from api
        const poolStateInput = await api.getPool(poolId);

        const client = createTestClient({
            mode: 'anvil',
            chain: CHAINS[chainId],
            transport: http(rpcUrl),
        })
            .extend(publicActions)
            .extend(walletActions);

        txInput = {
            client,
            poolJoin: new PoolJoin(),
            slippage: Slippage.fromPercentage('1'), // 1%
            poolStateInput,
            testAddress: '0x10A19e7eE7d7F8a52822f6817de8ea18204F2e4f', // Balancer DAO Multisig
            joinInput: {} as JoinInput,
        };

        // setup BPT token
        bptToken = new Token(chainId, poolStateInput.address, 18, 'BPT');
    });

    beforeEach(async () => {
        await forkSetup(
            txInput.client,
            txInput.testAddress,
            [
                ...txInput.poolStateInput.tokens.map((t) => t.address),
                txInput.poolStateInput.address,
            ],
            undefined, // TODO: hardcode these values to improve test performance
            [
                ...txInput.poolStateInput.tokens.map((t) =>
                    parseUnits('100', t.decimals),
                ),
                parseUnits('100', 18),
            ],
        );
    });

    describe('unbalanced join', () => {
        let input: Omit<UnbalancedJoinInput, 'amountsIn'>;
        let amountsIn: TokenAmount[];
        beforeAll(() => {
            const poolTokens = txInput.poolStateInput.tokens.map(
                (t) => new Token(chainId, t.address, t.decimals),
            );
            amountsIn = poolTokens.map((t) =>
                TokenAmount.fromHumanAmount(t, '1'),
            );
            input = {
                chainId,
                rpcUrl,
                kind: JoinKind.Unbalanced,
            };
        });
        test('with tokens', async () => {
            const joinInput = {
                ...input,
                amountsIn: [...amountsIn.splice(0, 1)],
            };

            const joinResult = await doJoin({
                ...txInput,
                joinInput,
            });
            assertUnbalancedJoin(
                txInput.client.chain?.id as number,
                txInput.poolStateInput,
                joinInput,
                joinResult,
                txInput.slippage,
            );
        });

        test('with native', async () => {
            const joinInput = {
                ...input,
                amountsIn,
                useNativeAssetAsWrappedAmountIn: true,
            };
            const joinResult = await doJoin({
                ...txInput,
                joinInput,
            });
            assertUnbalancedJoin(
                txInput.client.chain?.id as number,
                txInput.poolStateInput,
                joinInput,
                joinResult,
                txInput.slippage,
            );
        });
    });

    describe('single asset join', () => {
        let joinInput: SingleAssetJoinInput;
        beforeAll(() => {
            const bptOut = TokenAmount.fromHumanAmount(bptToken, '1');
            const tokenIn = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
            joinInput = {
                bptOut,
                tokenIn,
                chainId,
                rpcUrl,
                kind: JoinKind.SingleAsset,
            };
        });

        test('with token', async () => {
            const joinResult = await doJoin({
                ...txInput,
                joinInput,
            });

            assertSingleTokenJoin(
                txInput.client.chain?.id as number,
                txInput.poolStateInput,
                joinInput,
                joinResult,
                txInput.slippage,
            );
        });

        test('with native', async () => {
            const joinResult = await doJoin({
                ...txInput,
                joinInput: {
                    ...joinInput,
                    useNativeAssetAsWrappedAmountIn: true,
                },
            });

            assertSingleTokenJoin(
                txInput.client.chain?.id as number,
                txInput.poolStateInput,
                {
                    ...joinInput,
                    useNativeAssetAsWrappedAmountIn: true,
                },
                joinResult,
                txInput.slippage,
            );
        });
    });

    describe('proportional join', () => {
        let joinInput: ProportionalJoinInput;
        beforeAll(() => {
            const bptOut = TokenAmount.fromHumanAmount(bptToken, '1');
            joinInput = {
                bptOut,
                chainId,
                rpcUrl,
                kind: JoinKind.Proportional,
            };
        });
        test('with tokens', async () => {
            const joinResult = await doJoin({
                ...txInput,
                joinInput,
            });

            assertProportionalJoin(
                txInput.client.chain?.id as number,
                txInput.poolStateInput,
                joinInput,
                joinResult,
                txInput.slippage,
            );
        });
        test('with native', async () => {
            const joinResult = await doJoin({
                ...txInput,
                joinInput: {
                    ...joinInput,
                    useNativeAssetAsWrappedAmountIn: true,
                },
            });

            assertProportionalJoin(
                txInput.client.chain?.id as number,
                txInput.poolStateInput,
                {
                    ...joinInput,
                    useNativeAssetAsWrappedAmountIn: true,
                },
                joinResult,
                txInput.slippage,
            );
        });
    });
});

/*********************** Mock To Represent API Requirements **********************/

export class MockApi {
    public async getPool(id: Hex): Promise<PoolStateInput> {
        const tokens = [
            {
                address:
                    '0x198d7387fa97a73f05b8578cdeff8f2a1f34cd1f' as Address, // wjAURA
                decimals: 18,
                index: 0,
            },
            {
                address:
                    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' as Address, // WETH
                decimals: 18,
                index: 1,
            },
        ];

        return {
            id,
            address: getPoolAddress(id) as Address,
            type: 'WEIGHTED',
            tokens,
        };
    }
}

/******************************************************************************/
