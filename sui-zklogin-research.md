# Sui zkLogin Integration Guide
> Hackathon Research Brief · May 2026 · Deep research for builders

---

## Table of Contents

1. [What is zkLogin?](#1-what-is-zklogin)
2. [System Architecture](#2-system-architecture)
3. [Supported OAuth Providers](#3-supported-oauth-providers)
4. [Integration Paths](#4-integration-paths)
   - [4a. Enoki (Recommended)](#4a-integration-via-enoki-recommended)
   - [4b. Manual SDK](#4b-manual-integration-typescript-sdk)
5. [Code Samples](#5-code-samples)
6. [Salt Management](#6-salt-management-strategies)
7. [Security Model](#7-security-model)
8. [dApp Integration Patterns](#8-dapp-integration-patterns)
9. [Hackathon Checklist](#9-hackathon-checklist)
10. [Key Resources](#10-key-resources)

---

## 1. What is zkLogin?

zkLogin is a **native Sui primitive** that lets users create and control a Sui wallet using their existing Web2 credentials — Google, Apple, Facebook, Twitch — without ever managing seed phrases or installing wallet extensions. It is built directly into the Sui protocol, not a third-party bolt-on.

> **Core Value Proposition:** A user clicks "Sign in with Google" → a deterministic Sui address is derived → they can immediately sign and submit blockchain transactions. Zero wallet setup. Zero key management. Zero friction.

### Key Properties

| Property | What It Means |
|---|---|
| **Self-custodial** | The OAuth provider cannot transact on the user's behalf. Only the user can sign transactions. |
| **Two-factor security** | Transactions require both a valid OAuth credential AND a secret salt — compromising Google alone is not enough. |
| **Full privacy** | Zero-knowledge proofs ensure no Google/Apple/Twitch identity is ever written on-chain. The address is unlinkable to any Web2 identity. |
| **Native Sui** | Composable with multisig, sponsored transactions, and other Sui primitives. Not available on other chains. |
| **Audited** | Independently audited by two ZK-specializing firms. Groth16 ceremony with 100+ participants generating the CRS. |

### How the Address is Derived

Unlike traditional wallets where the address comes from a public key, a zkLogin address is derived from:

```
zkLoginAddress = hash(iss, aud, sub, user_salt)
```

- `iss` — OAuth provider identifier (e.g. `https://accounts.google.com`)
- `aud` — Your app's OAuth Client ID
- `sub` — The user's unique stable identifier from the OAuth provider
- `user_salt` — A secret random value that unlinks on-chain identity from Web2 identity

> **⚠️ Critical Warning:** If the `user_salt` is lost, the user permanently loses access to their zkLogin wallet. Salt management is one of the most important architectural decisions you'll make.

---

## 2. System Architecture

A zkLogin-enabled dApp involves three backend services and a frontend. Here is the complete flow:

```
┌─────────────────────────────────────────────────┐
│              COMPLETE ZKLOGIN FLOW               │
└─────────────────────────────────────────────────┘

USER BROWSER
  │  1. Generate ephemeral keypair (eph_sk, eph_pk)
  │  2. Compute nonce = hash(eph_pk, max_epoch, randomness)
  │
  ▼
OAUTH PROVIDER  (Google / Apple / Twitch / Facebook)
  │  3. User completes OAuth login flow
  │  4. JWT returned in redirect URL (contains nonce in payload)
  │
  ▼
SALT SERVICE
  │  5. Send JWT → receive unique user_salt
  │     (salt is deterministic per user per app)
  │
  ▼
ZK PROVING SERVICE
  │  6. Send (JWT, user_salt, eph_pk, jwt_randomness, max_epoch)
  │  7. Receive Groth16 ZK proof
  │
  ▼
USER BROWSER
  │  8. Derive zkLogin address from (iss, aud, sub, user_salt)
  │  9. Sign transaction with ephemeral private key (eph_sk)
  │
  ▼
SUI NETWORK
     10. Submit: (ephemeral signature + ZK proof + inputs)
     11. Validators verify proof against JWKs (stored on-chain)
     12. Transaction executes ✓
```

### The Three Backend Services

| Service | Responsibility | Who Runs It |
|---|---|---|
| **Salt Service** | Returns deterministic `user_salt` per user per app using a secret master seed | You, or Enoki/Mysten Labs |
| **ZK Proving Service** | Generates Groth16 zero-knowledge proofs (~2–3 sec compute) | Mysten Labs prover, Enoki, or self-hosted |
| **Sponsored Transactions** *(optional)* | Pays gas fees on behalf of users so they don't need SUI tokens | You, or Enoki |

### Ephemeral Keys — Explained

The ephemeral keypair is a temporary key pair generated fresh in the browser at the start of each session. The public key is embedded in the JWT nonce so it's cryptographically bound to the OAuth session. The private key **never leaves the browser** and expires at `max_epoch` — roughly 2–4 days per Sui epoch.

---

## 3. Supported OAuth Providers

| Provider | Mainnet | Testnet | Devnet |
|---|---|---|---|
| Google | ✅ | ✅ | ✅ |
| Apple | ✅ | ✅ | ✅ |
| Facebook | ✅ | ✅ | ✅ |
| Twitch | ✅ | ✅ | ✅ |
| AWS Cognito (per-tenant) | ✅ | ✅ | ✅ |
| Karrier One | ✅ | ✅ | ✅ |
| Credenza3 | ✅ | ✅ | ✅ |
| Slack | ❌ | ❌ | ✅ |
| Microsoft | ❌ | ❌ | ✅ |
| Kakao | ❌ | ❌ | ✅ |
| Auth0, Okta, WeChat | 🔍 Under review | — | — |

> **For Hackathons:** Google is the recommended starting point. It has the best documentation, broadest user base, and is supported across all Sui networks. Twitch is ideal for gaming dApps; Apple works well for iOS-first products.

Any provider that implements OpenID Connect (OIDC) is theoretically compatible.

---

## 4. Integration Paths

There are two routes. Choose based on your needs:

| | **Path A: Enoki** | **Path B: Manual SDK** |
|---|---|---|
| Salt management | Managed for you | You manage (or use Mysten Labs endpoint) |
| ZK proof generation | Managed for you | You call the prover endpoint |
| Sponsored transactions | Built-in API | You build your own |
| Time to working demo | < 1 hour | 3–5 hours |
| Free tier | Yes (dev/testnet) | Yes (prover is free for testnet) |
| Vendor dependency | Enoki must stay up | Mysten Labs prover must stay up |
| Best for | Hackathons, MVPs | Production, full control |

---

## 4a. Integration via Enoki (Recommended)

Enoki is a SaaS platform by Mysten Labs that wraps all zkLogin complexity behind a clean API. As of mid-2024, it has powered over **1.6 million unique ZK proofs and 4 million zkLogin transactions**.

### Step 1: Set Up Enoki Portal

1. Go to [portal.enoki.mystenlabs.com](https://portal.enoki.mystenlabs.com) → sign up → click **"Create your first App"**
2. Generate **two API keys**: one public (client-side) and one private (backend only — for sponsored transactions). Never expose the private key to the browser.
3. Go to **Auth Providers** → select Google → paste your Google OAuth Client ID
4. (Optional) Go to **Sponsored Transactions** → add allowed sender addresses and Move call targets you want to sponsor

### Step 2: Install Dependencies

```bash
npm install @mysten/enoki @mysten/dapp-kit @mysten/sui @tanstack/react-query
```

### Step 3: Configure the App

```tsx
// App.tsx
import { EnokiFlowProvider } from '@mysten/enoki/react';
import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();
const networks = { testnet: { url: getFullnodeUrl('testnet') } };

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        <WalletProvider>
          <EnokiFlowProvider apiKey={process.env.NEXT_PUBLIC_ENOKI_API_KEY}>
            <YourApp />
          </EnokiFlowProvider>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
```

### Step 4: Login Component

```tsx
// LoginButton.tsx
import { useEnokiFlow, useZkLoginSession } from '@mysten/enoki/react';

export function LoginButton() {
  const enokiFlow = useEnokiFlow();
  const session = useZkLoginSession();

  const handleLogin = async () => {
    await enokiFlow.createAuthorizationURL({
      provider: 'google',
      clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      redirectUrl: window.location.href,
      network: 'testnet',
    });
  };

  if (session?.address) {
    return <div>Logged in: {session.address}</div>;
  }

  return <button onClick={handleLogin}>Sign in with Google</button>;
}
```

### Step 5: Handle OAuth Callback

```tsx
// AuthCallback.tsx — rendered at your redirect URL
import { useEffect } from 'react';
import { useEnokiFlow } from '@mysten/enoki/react';
import { useNavigate } from 'react-router-dom';

export function AuthCallback() {
  const enokiFlow = useEnokiFlow();
  const navigate = useNavigate();

  useEffect(() => {
    // Parses JWT from URL fragment, calls Enoki salt + prover automatically
    enokiFlow
      .handleAuthCallback()
      .then(() => navigate('/'))
      .catch(console.error);
  }, []);

  return <div>Authenticating...</div>;
}
```

### Step 6: Submit a Transaction

```tsx
import { useEnokiFlow } from '@mysten/enoki/react';
import { Transaction } from '@mysten/sui/transactions';
import { useSuiClient } from '@mysten/dapp-kit';

function useSubmitTransaction() {
  const client = useSuiClient();
  const enokiFlow = useEnokiFlow();

  return async (txb: Transaction) => {
    const keypair = await enokiFlow.getKeypair({ network: 'testnet' });
    return client.signAndExecuteTransaction({
      transaction: txb,
      signer: keypair,
    });
  };
}
```

---

## 4b. Manual Integration (TypeScript SDK)

For full control over proof generation, salt management, and address derivation, use the `@mysten/sui/zklogin` module directly.

```bash
npm install @mysten/sui jose
```

### Step 1: Generate Ephemeral Keypair

```ts
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { generateNonce, generateRandomness } from '@mysten/sui/zklogin';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });

// Get current epoch for expiry window
const { epoch } = await suiClient.getLatestSuiSystemState();
const maxEpoch = Number(epoch) + 2; // valid for ~2–4 days

// Generate ephemeral keypair + randomness
const ephemeralKeyPair = new Ed25519Keypair();
const randomness = generateRandomness();
const nonce = generateNonce(
  ephemeralKeyPair.getPublicKey(),
  maxEpoch,
  randomness
);

// Store in sessionStorage (short-lived, not localStorage)
sessionStorage.setItem('eph_sk', ephemeralKeyPair.export().privateKey);
sessionStorage.setItem('randomness', randomness.toString());
sessionStorage.setItem('maxEpoch', maxEpoch.toString());
```

### Step 2: Initiate OAuth Redirect

```ts
const params = new URLSearchParams({
  client_id: 'YOUR_GOOGLE_CLIENT_ID',
  redirect_uri: 'http://localhost:3000/auth',
  response_type: 'id_token',
  scope: 'openid email',
  nonce: nonce, // CRITICAL: must be this specific computed nonce
});

window.location.replace(
  `https://accounts.google.com/o/oauth2/v2/auth?${params}`
);
```

### Step 3: Parse JWT & Get Salt

```ts
// After OAuth redirect, JWT is in the URL fragment: #id_token=...
const hashParams = new URLSearchParams(window.location.hash.slice(1));
const jwtToken = hashParams.get('id_token');

// Get user salt from Mysten Labs salt service (free for testnet)
const saltResponse = await fetch('https://salt.api.mystenlabs.com/get_salt', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: jwtToken }),
});
const { salt } = await saltResponse.json();
```

### Step 4: Generate ZK Proof

```ts
// Restore ephemeral keypair
const ephemeralKeyPair = Ed25519Keypair.fromSecretKey(
  sessionStorage.getItem('eph_sk')
);

// Call the ZK proving service
const proofResponse = await fetch('https://prover-dev.mystenlabs.com/v1', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jwt: jwtToken,
    extendedEphemeralPublicKey: ephemeralKeyPair
      .getPublicKey()
      .toSuiPublicKey(),
    maxEpoch: sessionStorage.getItem('maxEpoch'),
    jwtRandomness: sessionStorage.getItem('randomness'),
    salt: salt,
    keyClaimName: 'sub',
  }),
});
const zkProof = await proofResponse.json();
```

### Step 5: Derive Address, Sign & Submit

```ts
import { jwtToAddress, getZkLoginSignature, genAddressSeed } from '@mysten/sui/zklogin';
import { Transaction } from '@mysten/sui/transactions';
import { decodeJwt } from 'jose';

// 1. Derive Sui address from JWT + salt
const zkLoginAddress = jwtToAddress(jwtToken, salt);

// 2. Build your transaction
const txb = new Transaction();
txb.setSender(zkLoginAddress);
// ...add Move calls here...

// 3. Sign with ephemeral key
const txBytes = await txb.build({ client: suiClient });
const { signature: ephemeralSig } = await ephemeralKeyPair.signTransaction(txBytes);

// 4. Assemble full zkLogin signature
const decodedJwt = decodeJwt(jwtToken);
const addressSeed = genAddressSeed(
  BigInt(salt),
  'sub',
  decodedJwt.sub,
  decodedJwt.aud
).toString();

const zkLoginSignature = getZkLoginSignature({
  inputs: { ...zkProof, addressSeed },
  maxEpoch: sessionStorage.getItem('maxEpoch'),
  userSignature: ephemeralSig,
});

// 5. Execute on-chain
const result = await suiClient.executeTransactionBlock({
  transactionBlock: txBytes,
  signature: zkLoginSignature,
});
```

---

## 5. Code Samples

### Compute zkLogin Address from JWT (SDK helper)

```ts
import { jwtToAddress, computeZkLoginAddress } from '@mysten/sui/zklogin';

// Simple: derive address from raw JWT
const address = jwtToAddress(jwtAsString, salt);

// Explicit: derive address from claim components
const address = computeZkLoginAddress({
  claimName: 'sub',
  claimValue: '110463452167303000000',
  iss: 'https://accounts.google.com',
  aud: 'YOUR_CLIENT_ID',
  userSalt: BigInt(salt),
});
```

### Parse & Serialize zkLogin Signatures

```ts
import { parseZkLoginSignature, getZkLoginSignature } from '@mysten/sui/zklogin';

// Parse an existing zkLogin signature
const parsed = await parseZkLoginSignature('BQNNMTY4NjAxMzAyO....');

// Serialize a zkLogin signature for submission
const serialized = await getZkLoginSignature({
  inputs,        // ZK proof + addressSeed
  maxEpoch,      // expiry
  userSignature, // ephemeral signature over tx bytes
});
```

### Using the Community React Hook

```ts
import { useZkLogin, beginZkLogin } from 'use-sui-zklogin';
import type { OpenIdProvider, ProviderConfig } from 'use-sui-zklogin';

const providersConfig: ProviderConfig = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    clientId: 'YOUR_CLIENT_ID',
  },
};

const MyComponent = () => {
  const { isLoaded, address, accounts } = useZkLogin({
    urlZkProver: 'https://prover-dev.mystenlabs.com/v1',
    generateSalt: async () => ({ salt: Date.now() }), // replace with real logic
  });

  const handleLogin = async (provider: OpenIdProvider) => {
    await beginZkLogin({ suiClient, provider, providersConfig });
  };

  return (
    <button onClick={() => handleLogin('google')} disabled={!isLoaded}>
      {isLoaded ? 'Sign in with Google' : 'Loading...'}
    </button>
  );
};
```

---

## 6. Salt Management Strategies

The `user_salt` is critical — if lost, the wallet is permanently inaccessible. Here are your options:

| Strategy | How | Pros | Cons |
|---|---|---|---|
| **Enoki (Managed)** | Enoki generates and stores salt server-side | Zero work, production-ready, free tier | Vendor dependency |
| **Mysten Labs Salt Service** | POST JWT to `salt.api.mystenlabs.com` | Free, managed, deterministic | Testnet/devnet only |
| **Client-side (localStorage)** | Generate random salt once, store in browser | Simple, no backend, good for demos | Lost if browser cleared; not cross-device |
| **User-managed** | Show salt to user, ask them to save it | Fully self-custodial | Same UX problem as seed phrases |
| **Own Salt Server** | Deterministic salt from master seed + JWT sub | Full control, vendor-independent | You must secure the master seed |

> **Hackathon Recommendation:** Use **Enoki** for the hackathon. If going manual, use the **Mysten Labs salt service** on testnet — it requires no backend and just needs one POST call with your JWT.

### Own Salt Server — How It Works (Production)

Mysten Labs runs their salt server using **AWS Nitro Enclaves** for master seed security. The salt is computed as:

```
salt = HMAC(master_seed, user_sub + aud)
```

This guarantees the same user always gets the same salt — deterministic across sessions and devices — without storing per-user records. The master seed is generated inside the enclave and never leaves it.

---

## 7. Security Model

### zkLogin is a Two-Factor System

- **Factor 1:** Valid OAuth credential (active Google/Apple session)
- **Factor 2:** The `user_salt` (not managed by the OAuth provider)

An attacker who fully compromises a user's Google account **cannot steal funds** unless they also obtain the user's salt.

### Threat Vectors & Mitigations

| Threat | Impact | Mitigation |
|---|---|---|
| JWT leakage (XSS, phishing) | Privacy exposure; attacker can derive address if they also have the salt | JWT is scoped to your specific Client ID. Store JWT in memory, not localStorage. |
| Ephemeral key compromise | Attacker can sign transactions until max_epoch expires | Keys expire in 2–4 days. Store in `sessionStorage`, not `localStorage`. |
| Salt server compromise | Attacker could derive addresses and, combined with JWT, sign transactions | Use AWS Nitro Enclaves for key generation. Enoki handles this for you. |
| Cross-app proof reuse | JWT from a malicious app reused for your app's zkLogin | Proof is scoped to `aud` (Client ID). Cryptographically prevented. |
| OAuth provider shutdown | Users lose wallet access permanently | Offer a multisig recovery key alongside zkLogin; document a recovery strategy. |

### No On-Chain Identity Exposure

Nothing about the user's Google/Apple identity is ever written on-chain. Even a full Sui validator can only see the ZK proof and the derived address — never the `sub`, email, or name.

---

## 8. dApp Integration Patterns

### Pattern 1: Invisible Wallet (Full Abstraction)

The user has zero awareness of blockchain. No wallet UI, no "sign transaction" prompts. Transactions are silently sponsored and executed.

**Best for:** Gaming, social apps, e-commerce.

**Requires:** zkLogin + Sponsored Transactions (Enoki Gas Pool) + seamless UX. The user just clicks — you handle everything.

### Pattern 2: Visible Wallet with ZK Onboarding

Users see their wallet address and balance, but are onboarded through OAuth. Used by DeFi apps (BlueFin, NAVI, Aftermath). The user knows they're using crypto but doesn't manage a seed phrase.

### Pattern 3: Hybrid — zkLogin + Traditional Wallet

Offer both options. New users use zkLogin; power users connect Sui Wallet or Ledger. Use `@mysten/dapp-kit`'s `<ConnectButton>` which includes zkLogin wallets when registered via Enoki's `registerEnokiWallets()`.

### Pattern 4: zkLogin + Multisig (Recovery)

For production apps: create a 1-of-2 or 2-of-3 multisig where one key is the zkLogin address and another is a hardware wallet. Provides account recovery if the OAuth provider becomes unavailable.

### Pattern 5: On-Chain Verified Identity

Users can optionally link their OAuth identity to their on-chain address (verified identity mode). This builds a verifiable identity layer — useful for KYC-lite applications, reputation systems, or DAO governance requiring Sybil resistance.

### Real-World Integrations (2024–2025)

| App | Category | How They Use zkLogin |
|---|---|---|
| BlueFin | DeFi / Trading | Google sign-in → trade immediately, no wallet needed |
| NAVI Protocol | DeFi / Lending | Lending/borrowing with familiar social login |
| Aftermath Finance | DeFi / DEX | AMM access via OAuth |
| Ethos Wallet | Chrome Extension | zkLogin built into wallet UI |
| Surf Wallet | Mobile | zkLogin + zero-tracking, zero-custody policy |
| Suilette | Gaming | One-click onboarding for blockchain gaming |
| Quantum Temple | Gaming | Invisible wallet pattern |
| Blockbolt | Payments | Merchant payments with ZK-authenticated buyers |

---

## 9. Hackathon Checklist

### Setup Phase

- [ ] Create a Google Cloud project and OAuth 2.0 Web Client ID; set authorized redirect URIs
- [ ] Sign up at [portal.enoki.mystenlabs.com](https://portal.enoki.mystenlabs.com), create an App, generate two API keys (public + private)
- [ ] Register Google as an Auth Provider in Enoki portal; paste your Google Client ID
- [ ] `npm install @mysten/enoki @mysten/dapp-kit @mysten/sui @tanstack/react-query`
- [ ] Add environment variables: `NEXT_PUBLIC_ENOKI_API_KEY`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- [ ] Wrap app in `EnokiFlowProvider` and `SuiClientProvider`

### Auth Flow

- [ ] Implement OAuth redirect with `enokiFlow.createAuthorizationURL()`
- [ ] Create a callback route that calls `enokiFlow.handleAuthCallback()`
- [ ] Display derived Sui address to user after login
- [ ] Implement logout / session expiry handling

### Transactions

- [ ] Use `enokiFlow.getKeypair()` to sign transactions with the ephemeral key
- [ ] Build transactions using `Transaction` from `@mysten/sui/transactions`
- [ ] Configure Sponsored Transactions in Enoki portal (add allowed Move targets)
- [ ] Test that users can transact without holding any SUI for gas

### Testing & Polish

- [ ] Test full flow: login → transaction → logout → re-login (same address must return)
- [ ] Test on Sui Testnet (get test SUI at [faucet.testnet.sui.io](https://faucet.testnet.sui.io))
- [ ] Handle error states: OAuth cancelled, proof generation timeout, expired session
- [ ] Add session persistence: show login state on page reload

### Bonus Points

- [ ] Add multiple OAuth providers (Apple, Twitch) for broader user reach
- [ ] Combine with Sui Name Service (SuiNS) for human-readable addresses
- [ ] Implement multisig recovery for a stronger production safety story
- [ ] Show wallet balance post-login using `suiClient.getBalance()`
- [ ] Offer traditional wallet connect alongside zkLogin (hybrid pattern)

---

## 10. Key Resources

| Resource | URL |
|---|---|
| Official zkLogin Docs | https://docs.sui.io/concepts/cryptography/zklogin |
| zkLogin Integration Guide | https://docs.sui.io/guides/developer/cryptography/zklogin-integration |
| Enoki Portal | https://portal.enoki.mystenlabs.com |
| Enoki Docs | https://docs.enoki.mystenlabs.com |
| Enoki Example App (GitHub) | https://github.com/sui-foundation/enoki-example-app |
| Mysten TypeScript SDK Docs | https://sdk.mystenlabs.com/sui/zklogin |
| Mysten ZK Prover (Dev/Test) | `https://prover-dev.mystenlabs.com/v1` |
| Mysten Salt Service | `https://salt.api.mystenlabs.com/get_salt` |
| `use-sui-zklogin` React Hook | https://github.com/pixelbrawlgames/use-sui-zklogin |
| Awesome Sui (Tools & SDKs) | https://github.com/sui-foundation/awesome-sui |
| Sui Testnet Faucet | https://faucet.testnet.sui.io |
| HackMD Tutorial (React + Move + zkLogin) | https://hackmd.io/@moritzfelipe/HkEBKKzYa |

---

*Research compiled May 2026 · Sources: Sui Documentation, Mysten Labs Engineering Blog, Enoki Docs, community tutorials*
