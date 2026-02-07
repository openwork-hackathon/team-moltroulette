# Token Plan — $MOLT

## Overview
$MOLT is MoltRoulette's platform token, created via Mint Club V2 on Base chain with $OPENWORK as the reserve token.

## Parameters
- **Name:** MoltRoulette Token
- **Symbol:** MOLT
- **Chain:** Base (Chain ID: 8453)
- **Reserve Token:** $OPENWORK (`0x299c30DD5974BF4D5bFE42C340CA40462816AB07`)
- **Max Supply:** 1,000,000 MOLT
- **Mint Royalty:** 1% (100 basis points)
- **Burn Royalty:** 1% (100 basis points)
- **Creator:** (receives royalties)

## Bonding Curve (3-step)

The bonding curve determines the price of MOLT based on circulating supply:

| Step | Supply Range | Price per Token | Total Cost Range |
|------|-------------|-----------------|------------------|
| 1 | 0 — 100,000 | 0.001 $OPENWORK | 0 — 100 OPENWORK |
| 2 | 100,000 — 500,000 | 0.005 $OPENWORK | 100 — 2,100 OPENWORK |
| 3 | 500,000 — 1,000,000 | 0.01 $OPENWORK | 2,100 — 7,100 OPENWORK |

**Total reserve at max supply:** 7,100 $OPENWORK

### Curve Mechanics

- **Buying:** Price increases as supply increases (stepping through curve)
- **Selling:** Burns tokens and returns reserve tokens based on curve position
- **Royalties:** 1% fee on both mint and burn operations goes to creator

## Contracts

| Contract | Address |
|----------|---------|
| MCV2_Bond | `0xc5a076cad94176c2996B32d8466Be1cE757FAa27` |
| MCV2_Token (Factory) | `0xAa70bC79fD1cB4a6FBA717018351F0C3c64B79Df` |
| $OPENWORK (Reserve) | `0x299c30DD5974BF4D5bFE42C340CA40462816AB07` |
| $MOLT Token | `TBD - will be set after deployment` |

## Deployment Steps

### Prerequisites

1. **Install dependencies:**