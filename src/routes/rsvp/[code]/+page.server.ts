import type { PageServerLoad } from './$types';
import { Event } from '$lib/models.js';
import { connectDB } from '$lib/db.js';
import { error } from '@sveltejs/kit';
import { isValidInviteCode } from '$lib/utils/invite.js';
import { auth } from '$lib/auth.js';

export const load: PageServerLoad = async ({ params, request }) => {
	try {
		await connectDB();
		
		const { code } = params;
		
		if (!code || !isValidInviteCode(code)) {
			throw error(400, 'Invalid invite code');
		}
		
		// Find the event with this invite code
		const event = await Event.findOne({
			'inviteList.inviteCode': code
		}).populate('organizer_id', 'name email');
		
		if (!event) {
			throw error(404, 'Invitation not found');
		}
		
		// Find the specific invite
		const invite = event.inviteList?.find((inv: any) => inv.inviteCode === code);
		
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
			// Check if user has an active session
			const session = await auth.api.getSession({
				headers: request.headers
			});

			if (session?.session && session?.user) {
				authStatus.isAuthenticated = true;
				authStatus.user = session.user;

				// Check if the authenticated user is the invited user
				authStatus.isInvitedUser = session.user.email.toLowerCase() === invite.email.toLowerCase();

				if (!authStatus.isInvitedUser) {
					console.log(`⚠️ Server: User ${session.user.email} is not the invited user ${invite.email}`);
				} else {
					console.log(`✅ Server: User ${session.user.email} is the invited user`);

					// Only check calendar access if this is the invited user
					try {
						const tokenResponse = await auth.api.getAccessToken({
							body: {
								providerId: 'google',
								userId: session.user.id
							}
						});

						if (tokenResponse?.accessToken) {
							authStatus.hasCalendarAccess = true;
							console.log('✅ Server: User has calendar access');
						} else {
							console.log('⚠️ Server: User needs calendar access');
						}
					} catch (tokenError) {
						console.log('Server: No calendar access token available:', tokenError);
						authStatus.hasCalendarAccess = false;
					}
				}

				console.log('✅ Server: User is authenticated:', session.user.email);
			} else {
				console.log('⚠️ Server: No active session found');
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
