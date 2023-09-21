// pnpm test -- weightedExit.integration.test.ts
import { describe, expect, test, beforeAll, beforeEach } from 'vitest';
import dotenv from 'dotenv';
dotenv.config();

import {
    Client,
    createTestClient,
    http,
    parseUnits,
    publicActions,
    PublicActions,
    TestActions,
    WalletActions,
    walletActions,
} from 'viem';
import {
    BaseExit,
    SingleAssetExitInput,
    ProportionalExitInput,
    UnbalancedExitInput,
    ExitKind,
    PoolState,
    Slippage,
    Token,
    TokenAmount,
    replaceWrapped,
} from '../src/entities';
import { ExitParser } from '../src/entities/exit/parser';
import { Address, Hex } from '../src/types';
import { CHAINS, ChainId, getPoolAddress } from '../src/utils';
import { forkSetup, sendTransactionGetBalances } from './lib/utils/helper';

const chainId = ChainId.MAINNET;
const rpcUrl = 'http://127.0.0.1:8545/';
const blockNumber = 18043296n;
const testAddress = '0x10A19e7eE7d7F8a52822f6817de8ea18204F2e4f'; // Balancer DAO Multisig
const poolId =
    '0x5c6ee304399dbdb9c8ef030ab642b10820db8f56000200000000000000000014'; // 80BAL-20WETH
const slippage = Slippage.fromPercentage('1'); // 1%

describe('weighted exit test', () => {
    let api: MockApi;
    let client: Client & PublicActions & TestActions & WalletActions;
    let poolFromApi: PoolState;
    let weightedExit: BaseExit;
    let bpt: Token;

    beforeAll(async () => {
        // setup mock api
        api = new MockApi();

        // get pool state from api
        poolFromApi = await api.getPool(poolId);

        // setup exit helper
        const exitParser = new ExitParser();
        weightedExit = exitParser.getExit(poolFromApi.type);

        client = createTestClient({
            mode: 'hardhat',
            chain: CHAINS[chainId],
            transport: http(rpcUrl),
        })
            .extend(publicActions)
            .extend(walletActions);

        // setup BPT token
        bpt = new Token(chainId, poolFromApi.address, 18, 'BPT');
    });

    beforeEach(async () => {
        await forkSetup(
            client,
            testAddress,
            [poolFromApi.address],
            undefined, // TODO: hardcode these values to improve test performance
            [parseUnits('1', 18)],
            process.env.ETHEREUM_RPC_URL as string,
            blockNumber,
        );
    });

    test('single asset exit', async () => {
        const bptIn = TokenAmount.fromHumanAmount(bpt, '1');
        const tokenOut = '0xba100000625a3754423978a60c9317c58a424e3D'; // BAL

        // perform exit query to get expected bpt out
        const exitInput: SingleAssetExitInput = {
            chainId,
            rpcUrl,
            bptIn,
            tokenOut,
            kind: ExitKind.SINGLE_ASSET,
        };
        const { queryResult, maxBptIn, minAmountsOut } = await doTransaction(
            exitInput,
            poolFromApi.tokens.map((t) => t.address),
            bpt.address,
            slippage,
        );

        // Query should use correct BPT amount
        expect(queryResult.bptIn.amount).to.eq(bptIn.amount);

        // We only expect single asset to have a value for exit
        expect(queryResult.tokenOutIndex).to.be.toBeDefined;
        queryResult.amountsOut.forEach((a, i) => {
            if (i === queryResult.tokenOutIndex)
                expect(a.amount > 0n).to.be.true;
            else expect(a.amount === 0n).to.be.true;
        });

        // Confirm slippage - only to amounts out not bpt in
        const expectedMinAmountsOut = queryResult.amountsOut.map((a) =>
            slippage.removeFrom(a.amount),
        );
        expect(expectedMinAmountsOut).to.deep.eq(minAmountsOut);
        expect(maxBptIn).to.eq(bptIn.amount);
    });

    test('proportional exit', async () => {
        const bptIn = TokenAmount.fromHumanAmount(bpt, '1');

        // perform exit query to get expected bpt out
        const exitInput: ProportionalExitInput = {
            chainId,
            rpcUrl,
            bptIn,
            kind: ExitKind.PROPORTIONAL,
        };
        const { queryResult, maxBptIn, minAmountsOut } = await doTransaction(
            exitInput,
            poolFromApi.tokens.map((t) => t.address),
            bpt.address,
            slippage,
        );

        // Query should use correct BPT amount
        expect(queryResult.bptIn.amount).to.eq(bptIn.amount);

        // We expect all assets to have a value for exit
        expect(queryResult.tokenOutIndex).to.be.undefined;
        queryResult.amountsOut.forEach((a) => {
            expect(a.amount > 0n).to.be.true;
        });

        // Confirm slippage - only to amounts out not bpt in
        const expectedMinAmountsOut = queryResult.amountsOut.map((a) =>
            slippage.removeFrom(a.amount),
        );
        expect(expectedMinAmountsOut).to.deep.eq(minAmountsOut);
        expect(maxBptIn).to.eq(bptIn.amount);
    });

    test('unbalanced exit', async () => {
        const poolTokens = poolFromApi.tokens.map(
            (t) => new Token(chainId, t.address, t.decimals),
        );
        const amountsOut = poolTokens.map((t) =>
            TokenAmount.fromHumanAmount(t, '0.001'),
        );
        // perform exit query to get expected bpt out
        const exitInput: UnbalancedExitInput = {
            chainId,
            rpcUrl,
            amountsOut,
            kind: ExitKind.UNBALANCED,
        };
        const { queryResult, maxBptIn, minAmountsOut } = await doTransaction(
            exitInput,
            poolFromApi.tokens.map((t) => t.address),
            bpt.address,
            slippage,
        );

        // We expect a BPT input amount > 0
        expect(queryResult.bptIn.amount > 0n).to.be.true;

        // We expect assets to have same amount out as user defined
        expect(queryResult.tokenOutIndex).to.be.undefined;
        queryResult.amountsOut.forEach((a, i) => {
            expect(a.amount).to.eq(amountsOut[i].amount);
        });

        // Confirm slippage - only to bpt in, not amounts out
        const expectedMinAmountsOut = amountsOut.map((a) => a.amount);
        expect(expectedMinAmountsOut).to.deep.eq(minAmountsOut);
        const expectedMaxBptIn = slippage.applyTo(queryResult.bptIn.amount);
        expect(expectedMaxBptIn).to.deep.eq(maxBptIn);
    });

    test('exit with native asset', async () => {
        const bptIn = TokenAmount.fromHumanAmount(bpt, '1');

        // perform exit query to get expected bpt out
        const exitInput: ProportionalExitInput = {
            chainId,
            rpcUrl,
            bptIn,
            kind: ExitKind.PROPORTIONAL,
            exitWithNativeAsset: true,
        };

        // We have to use zero address for balanceDeltas
        const poolTokens = poolFromApi.tokens.map(
            (t) => new Token(chainId, t.address, t.decimals),
        );
        const { queryResult, maxBptIn, minAmountsOut } = await doTransaction(
            exitInput,
            replaceWrapped(poolTokens, chainId).map((a) => a.address),
            bpt.address,
            slippage,
        );
        // Query should use correct BPT amount
        expect(queryResult.bptIn.amount).to.eq(bptIn.amount);

        // We expect all assets to have a value for exit
        expect(queryResult.tokenOutIndex).to.be.undefined;
        queryResult.amountsOut.forEach((a) => {
            expect(a.amount > 0n).to.be.true;
        });

        // Confirm slippage - only to amounts out not bpt in
        const expectedMinAmountsOut = queryResult.amountsOut.map((a) =>
            slippage.removeFrom(a.amount),
        );
        expect(expectedMinAmountsOut).to.deep.eq(minAmountsOut);
        expect(maxBptIn).to.eq(bptIn.amount);
    });

    async function doTransaction(
        exitInput:
            | SingleAssetExitInput
            | ProportionalExitInput
            | UnbalancedExitInput,
        poolTokens: Address[],
        bptToken: Address,
        slippage: Slippage,
    ) {
        const queryResult = await weightedExit.query(exitInput, poolFromApi);

        const { call, to, value, maxBptIn, minAmountsOut } =
            weightedExit.buildCall({
                ...queryResult,
                slippage,
                sender: testAddress,
                recipient: testAddress,
            });

        // send transaction and check balance changes
        const { transactionReceipt, balanceDeltas } =
            await sendTransactionGetBalances(
                [...poolTokens, bptToken],
                client,
                testAddress,
                to,
                call,
                value,
            );
        expect(transactionReceipt.status).to.eq('success');

        // Confirm final balance changes match query result
        const expectedDeltas = [
            ...queryResult.amountsOut.map((a) => a.amount),
            queryResult.bptIn.amount,
        ];
        expect(expectedDeltas).to.deep.eq(balanceDeltas);

        return {
            queryResult,
            maxBptIn,
            minAmountsOut,
        };
    }
});

/*********************** Mock To Represent API Requirements **********************/

export class MockApi {
    public async getPool(id: Hex): Promise<PoolState> {
        let tokens: { address: Address; decimals: number; index: number }[] =
            [];
        if (
            id ===
            '0x5c6ee304399dbdb9c8ef030ab642b10820db8f56000200000000000000000014'
        ) {
            tokens = [
                {
                    address: '0xba100000625a3754423978a60c9317c58a424e3d', // BAL
                    decimals: 18,
                    index: 0,
                },
                {
                    address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // wETH
                    decimals: 18,
                    index: 1,
                },
            ];
        } else if (
            id ===
            '0x87a867f5d240a782d43d90b6b06dea470f3f8f22000200000000000000000516'
        ) {
            tokens = [
                {
                    address: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0', // wstETH slot 0
                    decimals: 18,
                    index: 0,
                },
                {
                    address: '0xc00e94cb662c3520282e6f5717214004a7f26888', // COMP slot 1
                    decimals: 18,
                    index: 1,
                },
            ];
        }
        return {
            id,
            address: getPoolAddress(id) as Address,
            type: 'Weighted',
            tokens,
        };
    }
}

/******************************************************************************/
