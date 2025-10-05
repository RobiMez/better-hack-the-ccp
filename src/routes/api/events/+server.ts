import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Event, User } from '$lib/models.js';
import { EventType, EventStatus } from '$lib/models/event.model.types.js';
import { connectDB } from '$lib/db.js';
import mongoose from 'mongoose';

// GET - Fetch all events
export const GET: RequestHandler = async ({ url }) => {
	try {
		await connectDB();
		const limit = parseInt(url.searchParams.get('limit') || '50');
		const skip = parseInt(url.searchParams.get('skip') || '0');
		const status = url.searchParams.get('status');
		const eventType = url.searchParams.get('eventType');
		
		const query: { status?: string; eventType?: string } = {};
		
		if (status) query.status = status;
		if (eventType) query.eventType = eventType;
		
		const events = await Event.find(query)
			.populate('organizerId', 'name email')
			.populate('rsvpList', 'name email')
			.sort({ createdAt: -1 })
			.limit(limit)
			.skip(skip);
			
		const total = await Event.countDocuments(query);
		
		return json({
			events,
			total,
			limit,
			skip
		});
	} catch (error) {
		console.error('Error fetching events:', error);
		return json({ error: 'Failed to fetch events' }, { status: 500 });
	}
};

// POST - Create a new event
export const POST: RequestHandler = async ({ request }) => {
	try {
		await connectDB();
		
		const data = await request.json();
		const { eventType, organizerId, name, description, bounds, inviteList, ticketSlots } = data;
		
		if (!eventType || !organizerId || !name || !bounds) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}
		
		// Validate organizerId is a valid ObjectId
		if (!mongoose.Types.ObjectId.isValid(organizerId)) {
			return json({ error: 'Invalid organizerId' }, { status: 400 });
		}
		
		// Check if the user actually exists
		const userExists = await User.findById(organizerId);
		if (!userExists) {
			return json({ error: 'Invalid organizerId - user does not exist' }, { status: 400 });
		}
		
		const eventData = {
			eventType,
			organizerId: new mongoose.Types.ObjectId(organizerId), // Explicitly convert to ObjectId
			name,
			description,
			bounds,
			status: EventStatus.DRAFT,
			inviteList: eventType === EventType.SMALL && inviteList ? inviteList : [],
			ticketSlots: eventType === EventType.LARGE && ticketSlots ? ticketSlots : []
		};
		
		const event = new Event(eventData);
		await event.save();
		await event.populate('organizerId', 'name email');
		
		return json({ event }, { status: 201 });
	} catch (error) {
		console.error('Error creating event:', error);
		return json({ error: 'Failed to create event' }, { status: 500 });
	}
};
