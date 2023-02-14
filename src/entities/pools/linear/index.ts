import { PoolType, SwapKind } from '../../../types';
import { BigintIsh, Token, TokenAmount } from '../../';
import { BasePool } from '../../pools';
import { getPoolAddress, MAX_UINT112, unsafeFastParseEther, WAD } from '../../../utils';
import {
    _calcBptOutPerMainIn,
    _calcBptOutPerWrappedIn,
    _calcMainOutPerBptIn,
    _calcMainOutPerWrappedIn,
    _calcWrappedOutPerBptIn,
    _calcWrappedOutPerMainIn,
    _calcMainInPerWrappedOut,
    _calcMainInPerBptOut,
    _calcWrappedInPerMainOut,
    _calcWrappedInPerBptOut,
    _calcBptInPerWrappedOut,
    _calcBptInPerMainOut,
} from './math';
import { RawLinearPool } from '../../../data/types';

const ALMOST_ONE = unsafeFastParseEther('0.99');
const ONE = unsafeFastParseEther('1');
const MAX_RATIO = unsafeFastParseEther('10');
const MAX_TOKEN_BALANCE = MAX_UINT112 - 1n;

export class BPT extends TokenAmount {
    public readonly rate: bigint;
    public readonly virtualBalance: bigint;

    public constructor(token: Token, amount: BigintIsh) {
        super(token, amount);
        this.rate = WAD;
        this.virtualBalance = MAX_TOKEN_BALANCE - this.amount;
    }
}

export class WrappedToken extends TokenAmount {
    public readonly rate: bigint;
    public readonly scale18: bigint;

    public constructor(token: Token, amount: BigintIsh, rate: BigintIsh) {
        super(token, amount);
        this.rate = BigInt(rate);
        this.scale18 = (this.amount * this.scalar * this.rate) / WAD;
    }
}

export type Params = {
    fee: bigint;
    rate: bigint;
    lowerTarget: bigint;
    upperTarget: bigint;
};

export class LinearPool implements BasePool {
    readonly id: string;
    readonly address: string;
    readonly poolType: PoolType = PoolType.AaveLinear;
    readonly poolTypeVersion: number;
    swapFee: bigint;
    mainToken: TokenAmount;
    wrappedToken: WrappedToken;
    bptToken: BPT;
    params: Params;

    static fromRawPool(pool: RawLinearPool): LinearPool {
        const orderedTokens = pool.tokens.sort((a, b) => a.index - b.index);
        const swapFee = unsafeFastParseEther(pool.swapFee);

        const mT = orderedTokens[pool.mainIndex];
        const mToken = new Token(1, mT.address, mT.decimals, mT.symbol, mT.name);
        const lowerTarget = TokenAmount.fromHumanAmount(mToken, pool.lowerTarget);
        const upperTarget = TokenAmount.fromHumanAmount(mToken, pool.upperTarget);
        const mTokenAmount = TokenAmount.fromHumanAmount(mToken, mT.balance);

        const wT = orderedTokens[pool.wrappedIndex];
        const wTRate = unsafeFastParseEther(wT.priceRate || '1.0');

        const wToken = new Token(1, wT.address, wT.decimals, wT.symbol, wT.name);
        const wTokenAmount = TokenAmount.fromHumanAmount(wToken, wT.balance);
        const wrappedToken = new WrappedToken(wToken, wTokenAmount.amount, wTRate);

        const bptIndex: number = orderedTokens.findIndex(t => t.address === pool.address);
        const bT = orderedTokens[bptIndex];
        const bToken = new Token(1, bT.address, bT.decimals, bT.symbol, bT.name);
        const bTokenAmount = TokenAmount.fromHumanAmount(bToken, bT.balance);
        const bptToken = new BPT(bToken, bTokenAmount.amount);

        const params: Params = {
            fee: swapFee,
            rate: wTRate,
            lowerTarget: lowerTarget.scale18,
            upperTarget: upperTarget.scale18,
        };

        const linearPool = new LinearPool(
            pool.id,
            pool.poolTypeVersion,
            params,
            mTokenAmount,
            wrappedToken,
            bptToken,
        );
        return linearPool;
    }

    constructor(
        id: string,
        poolTypeVersion: number,
        params: Params,
        mainToken: TokenAmount,
        wrappedToken: WrappedToken,
        bptToken: BPT,
    ) {
        this.id = id;
        this.poolTypeVersion = poolTypeVersion;
        this.swapFee = params.fee;
        this.mainToken = mainToken;
        this.wrappedToken = wrappedToken;
        this.bptToken = bptToken;
        this.address = getPoolAddress(id);
        this.params = params;
    }

    public get tokens() {
        return [this.mainToken, this.wrappedToken, this.bptToken];
    }

    public getNormalizedLiquidity(tokenIn: Token, tokenOut: Token): bigint {
        const tIn = this.tokens.find(t => t.token.address === tokenIn.address);
        const tOut = this.tokens.find(t => t.token.address === tokenOut.address);

        if (!tIn || !tOut) throw new Error('Pool does not contain the tokens provided');
        // TODO: Fix linear normalized liquidity calc
        return tOut.amount;
    }

    public swapGivenIn(tokenIn: Token, tokenOut: Token, swapAmount: TokenAmount): TokenAmount {
        const tOutIndex = this.tokens.findIndex(t => t.token.address === tokenOut.address);

        let output: TokenAmount;
        if (tokenIn.isEqual(this.mainToken.token)) {
            if (tokenOut.isEqual(this.wrappedToken.token)) {
                output = this._exactMainTokenInForWrappedOut(swapAmount);
            } else {
                output = this._exactMainTokenInForBptOut(swapAmount);
            }
        } else if (tokenIn.isEqual(this.wrappedToken.token)) {
            if (tokenOut.isEqual(this.mainToken.token)) {
                output = this._exactWrappedTokenInForMainOut(swapAmount);
            } else {
                output = this._exactWrappedTokenInForBptOut(swapAmount);
            }
        } else if (tokenIn.isEqual(this.bptToken.token)) {
            if (tokenOut.isEqual(this.mainToken.token)) {
                output = this._exactBptInForMainOut(swapAmount);
            } else {
                output = this._exactBptInForWrappedOut(swapAmount);
            }
        } else {
            throw new Error('Pool does not contain the tokens provided');
        }

        if (output.amount > this.tokens[tOutIndex].amount)
            throw new Error('Swap amount exceeds the pool limit');

        return output;
    }

    public swapGivenOut(tokenIn: Token, tokenOut: Token, swapAmount: TokenAmount): TokenAmount {
        const tOutIndex = this.tokens.findIndex(t => t.token.address === tokenOut.address);

        if (swapAmount.amount > this.tokens[tOutIndex].amount)
            throw new Error('Swap amount exceeds the pool limit');

        if (tokenIn.isEqual(this.mainToken.token)) {
            if (tokenOut.isEqual(this.wrappedToken.token)) {
                return this._mainTokenInForExactWrappedOut(swapAmount);
            } else {
                return this._mainTokenInForExactBptOut(swapAmount);
            }
        } else if (tokenIn.isEqual(this.wrappedToken.token)) {
            if (tokenOut.isEqual(this.mainToken.token)) {
                return this._wrappedTokenInForExactMainOut(swapAmount);
            } else {
                return this._wrappedTokenInForExactBptOut(swapAmount);
            }
        } else if (tokenIn.isEqual(this.bptToken.token)) {
            if (tokenOut.isEqual(this.mainToken.token)) {
                return this._bptInForExactMainOut(swapAmount);
            } else {
                return this._bptInForExactWrappedOut(swapAmount);
            }
        } else {
            throw new Error('Pool does not contain the tokens provided');
        }
    }

    public getLimitAmountSwap(tokenIn: Token, tokenOut: Token, swapKind: SwapKind): bigint {
        const tIn = this.tokens.find(t => t.token.address === tokenIn.address);
        const tOut = this.tokens.find(t => t.token.address === tokenOut.address);

        if (!tIn || !tOut) throw new Error('Pool does not contain the tokens provided');

        if (swapKind === SwapKind.GivenIn) {
            if (tokenOut.isEqual(this.bptToken.token)) {
                // Swapping to BPT allows for a very large amount so using pre-minted amount as estimation
                return MAX_TOKEN_BALANCE;
            } else {
                const amount = TokenAmount.fromRawAmount(
                    tokenOut,
                    (tOut.amount * ALMOST_ONE) / ONE,
                );

                return this.swapGivenOut(tokenIn, tokenOut, amount).amount;
            }
        } else {
            if (tokenOut.isEqual(this.bptToken.token)) {
                return (tOut.amount * MAX_RATIO) / ONE;
            } else {
                return (tOut.amount * ALMOST_ONE) / ONE;
            }
        }
    }

    private _exactMainTokenInForWrappedOut(swapAmount: TokenAmount): TokenAmount {
        const tokenOutScale18 = _calcWrappedOutPerMainIn(
            swapAmount.scale18,
            this.mainToken.scale18,
            this.params,
        );

        return TokenAmount.fromScale18Amount(this.wrappedToken.token, tokenOutScale18);
    }

    private _exactMainTokenInForBptOut(swapAmount: TokenAmount): TokenAmount {
        const tokenOutScale18 = _calcBptOutPerMainIn(
            swapAmount.scale18,
            this.mainToken.scale18,
            this.wrappedToken.scale18,
            this.bptToken.virtualBalance,
            this.params,
        );

        return TokenAmount.fromScale18Amount(this.bptToken.token, tokenOutScale18);
    }

    private _exactWrappedTokenInForMainOut(swapAmount: TokenAmount): TokenAmount {
        const tokenOutScale18 = _calcMainOutPerWrappedIn(
            swapAmount.scale18,
            this.mainToken.scale18,
            this.params,
        );

        return TokenAmount.fromScale18Amount(this.mainToken.token, tokenOutScale18);
    }

    private _exactWrappedTokenInForBptOut(swapAmount: TokenAmount): TokenAmount {
        const tokenOutScale18 = _calcBptOutPerWrappedIn(
            swapAmount.scale18,
            this.mainToken.scale18,
            this.wrappedToken.scale18,
            this.bptToken.virtualBalance,
            this.params,
        );

        return TokenAmount.fromScale18Amount(this.bptToken.token, tokenOutScale18);
    }

    private _exactBptInForMainOut(swapAmount: TokenAmount): TokenAmount {
        const tokenOutScale18 = _calcMainOutPerBptIn(
            swapAmount.scale18,
            this.mainToken.scale18,
            this.wrappedToken.scale18,
            this.bptToken.virtualBalance,
            this.params,
        );

        return TokenAmount.fromScale18Amount(this.mainToken.token, tokenOutScale18);
    }

    private _exactBptInForWrappedOut(swapAmount: TokenAmount): TokenAmount {
        const tokenOutScale18 = _calcWrappedOutPerBptIn(
            swapAmount.scale18,
            this.mainToken.scale18,
            this.wrappedToken.scale18,
            this.bptToken.virtualBalance,
            this.params,
        );

        return TokenAmount.fromScale18Amount(this.wrappedToken.token, tokenOutScale18);
    }

    private _mainTokenInForExactWrappedOut(swapAmount: TokenAmount): TokenAmount {
        const tokenOutScale18 = _calcMainInPerWrappedOut(
            swapAmount.scale18,
            this.mainToken.scale18,
            this.params,
        );

        return TokenAmount.fromScale18Amount(this.mainToken.token, tokenOutScale18, true);
    }

    private _mainTokenInForExactBptOut(swapAmount: TokenAmount): TokenAmount {
        const tokenOutScale18 = _calcMainInPerBptOut(
            swapAmount.scale18,
            this.mainToken.scale18,
            this.wrappedToken.scale18,
            this.bptToken.virtualBalance,
            this.params,
        );

        return TokenAmount.fromScale18Amount(this.mainToken.token, tokenOutScale18, true);
    }

    private _wrappedTokenInForExactMainOut(swapAmount: TokenAmount): TokenAmount {
        const tokenOutScale18 = _calcWrappedInPerMainOut(
            swapAmount.scale18,
            this.mainToken.scale18,
            this.params,
        );

        return TokenAmount.fromScale18Amount(this.wrappedToken.token, tokenOutScale18, true);
    }

    private _wrappedTokenInForExactBptOut(swapAmount: TokenAmount): TokenAmount {
        const tokenOutScale18 = _calcWrappedInPerBptOut(
            swapAmount.scale18,
            this.mainToken.scale18,
            this.wrappedToken.scale18,
            this.bptToken.virtualBalance,
            this.params,
        );

        return TokenAmount.fromScale18Amount(this.wrappedToken.token, tokenOutScale18, true);
    }

    private _bptInForExactMainOut(swapAmount: TokenAmount): TokenAmount {
        const tokenOutScale18 = _calcBptInPerMainOut(
            swapAmount.scale18,
            this.mainToken.scale18,
            this.wrappedToken.scale18,
            this.bptToken.virtualBalance,
            this.params,
        );

        return TokenAmount.fromScale18Amount(this.bptToken.token, tokenOutScale18, true);
    }

    private _bptInForExactWrappedOut(swapAmount: TokenAmount): TokenAmount {
        const tokenOutScale18 = _calcBptInPerWrappedOut(
            swapAmount.scale18,
            this.mainToken.scale18,
            this.wrappedToken.scale18,
            this.bptToken.virtualBalance,
            this.params,
        );

        return TokenAmount.fromScale18Amount(this.bptToken.token, tokenOutScale18, true);
    }
}