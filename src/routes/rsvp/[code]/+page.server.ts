import type { PageServerLoad } from './$types';
import { Event } from '$lib/models.js';
import { connectDB } from '$lib/db.js';
import { error } from '@sveltejs/kit';
import { isValidInviteCode } from '$lib/utils/invite.js';

export const load: PageServerLoad = async ({ params }) => {
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
		
		return {
			event: JSON.parse(JSON.stringify(event)),
			invite: JSON.parse(JSON.stringify(invite)),
			inviteCode: code
		};
	} catch (err) {
		console.error('Error loading RSVP page:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to load invitation');
	}
};
