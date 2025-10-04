import QRCode from 'qrcode';

/**
 * Generate a unique invite code using Web Crypto API (browser-compatible)
 */
export function generateInviteCode(): string {
	// Use browser's crypto API
	const array = new Uint8Array(16);
	crypto.getRandomValues(array);
	return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate QR code as data URL for an invite code
 */
export async function generateQRCode(inviteCode: string, baseUrl?: string): Promise<string> {
	try {
		// Use current origin if no baseUrl provided (for browser compatibility)
		const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
		const rsvpUrl = `${baseUrl || currentOrigin}/rsvp/${inviteCode}`;
		
		const qrCodeDataUrl = await QRCode.toDataURL(rsvpUrl, {
			width: 200,
			margin: 2,
			color: {
				dark: '#000000',
				light: '#FFFFFF'
			}
		});
		return qrCodeDataUrl;
	} catch (error) {
		console.error('Error generating QR code:', error);
		throw error;
	}
}

/**
 * Validate invite code format
 */
export function isValidInviteCode(code: string): boolean {
	return /^[a-f0-9]{32}$/.test(code);
}
