import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Event, User } from '$lib/models.js';
import { connectDB } from '$lib/db.js';
import { isValidInviteCode } from '$lib/utils/invite.js';

export const POST: RequestHandler = async ({ params, request }) => {
	try {
		await connectDB();
		
		const { code } = params;
		const { response, userEmail } = await request.json();
		
		if (!code || !isValidInviteCode(code)) {
			return json({ error: 'Invalid invite code' }, { status: 400 });
		}
		
		if (!response || !['accepted', 'declined'].includes(response)) {
			return json({ error: 'Invalid response' }, { status: 400 });
		}
		
		// Find the user by email to get their userId
		let userId = null;
		if (userEmail) {
			const user = await User.findOne({ email: userEmail.toLowerCase() });
			if (user) {
				userId = user._id;
				console.log(`Linked invite to user ${userEmail} (${userId})`);
			} else {
				console.log(`User not found for email ${userEmail}`);
			}
		}
		
		// Find and update the invite
		const event = await Event.findOneAndUpdate(
			{ 'inviteList.inviteCode': code },
			{ 
				$set: { 
					'inviteList.$.status': response,
					'inviteList.$.updatedAt': new Date(),
					...(userEmail && { 'inviteList.$.respondedByEmail': userEmail }),
					...(userId && { 'inviteList.$.userId': userId })
				}
			},
			{ new: true }
		);
		
		if (!event) {
			return json({ error: 'Invitation not found' }, { status: 404 });
		}
		
		const updatedInvite = event.inviteList?.find((inv: any) => inv.inviteCode === code);
		
		return json({ 
			message: `Invitation ${response} successfully`,
			invite: updatedInvite
		});
		
	} catch (error) {
		console.error('Error updating RSVP:', error);
		return json({ error: 'Failed to update RSVP' }, { status: 500 });
	}
};
