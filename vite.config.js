import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		host: '0.0.0.0',
		port: 5173,
		allowedHosts: ['lemuel-overdry-jeni.ngrok-free.dev'],
		https: undefined, // Let ngrok handle HTTPS
		headers: {
			'Cross-Origin-Embedder-Policy': 'credentialless',
			'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
			'Cross-Origin-Resource-Policy': 'cross-origin',
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
			'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com; connect-src 'self' https://*.infura.io https://*.alchemy.com wss://*.infura.io https://api.mainnet-beta.solana.com https://*.ngrok-free.dev; frame-src 'self' https://*.ngrok-free.dev; img-src 'self' data: https://*.ngrok-free.dev"
		}
	}
});
