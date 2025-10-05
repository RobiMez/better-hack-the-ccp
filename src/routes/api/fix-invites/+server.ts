import { json, type RequestEvent } from '@sveltejs/kit';
import { Event, User } from '$lib/models';
import { connectDB } from '$lib/db';

/**
 * Fix existing accepted invites by linking them to their userIds
 */
export const POST = async ({ request }: RequestEvent) => {
	try {
		await connectDB();

		const { eventId } = await request.json();

		const event = await Event.findById(eventId);
		if (!event) {
			return json({ error: 'Event not found' }, { status: 404 });
		}

		let fixedCount = 0;

		// Loop through all invites
		for (const invite of event.inviteList || []) {
			// If invite is accepted but no userId
			if (invite.status === 'accepted' && !invite.userId && invite.respondedByEmail) {
				// Find user by email
				const user = await User.findOne({ email: invite.respondedByEmail.toLowerCase() });
				
				if (user) {
					invite.userId = user._id;
					fixedCount++;
					console.log(`Linked ${invite.respondedByEmail} to userId ${user._id}`);
				} else {
					console.log(`User not found for ${invite.respondedByEmail}`);
				}
			}
		}

		if (fixedCount > 0) {
			await event.save();
		}

		return json({
			success: true,
			message: `Fixed ${fixedCount} invites`,
			fixedCount
		});
	} catch (error) {
		console.error('Error fixing invites:', error);
		return json({ error: 'Failed to fix invites' }, { status: 500 });
	}
};

