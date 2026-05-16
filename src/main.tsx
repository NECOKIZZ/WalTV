import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { EnokiFlowProvider } from '@mysten/enoki/react';
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc';
import '@mysten/dapp-kit/dist/index.css';

import App from './app/App.tsx';
import './styles/index.css';
import { enokiPublicApiKey, suiNetwork, suiNetworkConfig } from './lib/sui';

// Construct a SuiJsonRpcClient per supported network. SuiClientProvider
// accepts either a NetworkConfig (requires a `network` field per v2 SDK) or
// a pre-built client; the client form is simpler here.
const suiClients = {
  testnet: new SuiJsonRpcClient({ url: suiNetworkConfig.testnet.url, network: 'testnet' }),
  mainnet: new SuiJsonRpcClient({ url: suiNetworkConfig.mainnet.url, network: 'mainnet' }),
  devnet: new SuiJsonRpcClient({ url: suiNetworkConfig.devnet.url, network: 'devnet' }),
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 30, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <SuiClientProvider networks={suiClients} defaultNetwork={suiNetwork}>
      <WalletProvider autoConnect>
        <EnokiFlowProvider apiKey={enokiPublicApiKey}>
          <App />
        </EnokiFlowProvider>
      </WalletProvider>
    </SuiClientProvider>
  </QueryClientProvider>,
);