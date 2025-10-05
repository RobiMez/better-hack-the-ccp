/* eslint-disable @typescript-eslint/ban-ts-comment */
import type { PageServerLoad } from './$types';
import { Event } from '$lib/models.js';
import { connectDB } from '$lib/db.js';
import { error } from '@sveltejs/kit';
import { isValidInviteCode } from '$lib/utils/invite.js';
import { auth } from '$lib/auth.js';

async function makeGoogleAPICall(
	url: string,
	options: RequestInit,
	userId: string,
	maxRetries = 1,
	request: Request
): Promise<Response> {
	let accessToken;

	// Get initial access token
	try {
		const tokenResponse = await auth.api.getAccessToken({
			body: {
				providerId: 'google',
				userId: userId
			},
			headers: request.headers
		});
		accessToken = tokenResponse.accessToken;
	} catch (error) {
		console.error('Failed to get access token:', error);
		throw new Error('Failed to get access token');
	}

	// Make the API call
	const requestOptions = {
		...options,
		headers: {
			...options.headers,
			Authorization: `Bearer ${accessToken}`
		}
	};

	let response = await fetch(url, requestOptions);

	// If we get a 401, try to refresh the token and retry
	if (response.status === 401 && maxRetries > 0) {
		console.log('Got 401, attempting to refresh token...');

		try {
			// Refresh the token
			const refreshResponse = await auth.api.refreshToken({
				body: {
					providerId: 'google',
					userId: userId
				}
			});
			console.log(refreshResponse);

			// Get the new access token
			const newTokenResponse = await auth.api.getAccessToken({
				body: {
					providerId: 'google',
					userId: userId
				},
				headers: request.headers
			});

			// Retry the API call with the new token
			const retryOptions = {
				...options,
				headers: {
					...options.headers,
					Authorization: `Bearer ${newTokenResponse.accessToken}`
				}
			};

			response = await fetch(url, retryOptions);
			console.log('Token refreshed and API call retried');
		} catch (refreshError) {
			console.error('Failed to refresh token:', refreshError);
			// Return the original 401 response if refresh fails
		}
	}

	return response;
}

const attemptCalScope = async (user: { id: string; email: string }, request: Request) => {
	const calendarId = 'primary';
	const timeMin = new Date().toISOString();
	const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days window

	// Query Google Calendar API for busy times with automatic token refresh
	const res = await makeGoogleAPICall(
		'https://www.googleapis.com/calendar/v3/freeBusy',
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				timeMin,
				timeMax,
				items: [{ id: calendarId }]
			})
		},
		user.id,
		1,
		request
	);

	return res.ok;
};

export const load: PageServerLoad = async ({ params, request, locals }) => {
	try {
		await connectDB();

		const { code } = params;

		if (!code || !isValidInviteCode(code)) {
			throw error(400, 'Invalid invite code');
		}

		// Find the event with this invite code
		const event = await Event.findOne({
			'inviteList.inviteCode': code
		}).populate('organizerId', 'name email');

		if (!event) {
			throw error(404, 'Invitation not found');
		}

		// Find the specific invite
		const invite = event.inviteList?.find((inv: { inviteCode: string; email: string }) => inv.inviteCode === code);

		if (!invite) {
			throw error(404, 'Invitation not found');
		}

		// Check authentication status server-side
		const authStatus = {
			isAuthenticated: false,
			hasCalendarAccess: false,
			user: null,
			accounts: [],
			isInvitedUser: false,
			invitedEmail: invite.email
		};

		try {
			// Check if user has an active session from hooks.server.ts
			if (locals.session && locals.user) {
				authStatus.isAuthenticated = true;
				authStatus.user = locals.user;

				// Check if the authenticated user is the invited user
				authStatus.isInvitedUser = locals.user.email.toLowerCase() === invite.email.toLowerCase();

				if (!authStatus.isInvitedUser) {
					console.log(
						`⚠️ Server: User ${locals.user.email} is not the invited user ${invite.email}`
					);
				} else {
					console.log(`✅ Server: User ${locals.user.email} is the invited user`);

					// Only check calendar access if this is the invited user
					try {
						const tokenResponse = await auth.api.getAccessToken({
							body: {
								providerId: 'google',
								userId: locals.user.id
							},
							headers: request.headers
						});

						if (tokenResponse?.accessToken && (await attemptCalScope(locals.user, request))) {
							authStatus.hasCalendarAccess = true;
							console.log('✅ Server: User has calendar access');
						} else {
							authStatus.hasCalendarAccess = false;
							console.log('⚠️ Server: User needs calendar access');
						}
					} catch (tokenError) {
						console.log('Server: No calendar access token available:', tokenError);
						authStatus.hasCalendarAccess = false;
					}
				}

				console.log('✅ Server: User is authenticated:', locals.user.email);
			} else {
				console.log('⚠️ Server: No active session found');
				console.log(locals)
			}
		} catch (authError) {
			console.log('Server: Error checking authentication:', authError);
		}


		return {
			event: JSON.parse(JSON.stringify(event)),
			invite: JSON.parse(JSON.stringify(invite)),
			inviteCode: code,
			authStatus
		};
	} catch (err) {
		console.error('Error loading RSVP page:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to load invitation');
	}
};
