import mongoose, { type Document } from 'mongoose';

export enum EventStatus {
	DRAFT = 'DRAFT',
	INVITING = 'INVITING',
	FINALIZED = 'FINALIZED',
	CANCELLED = 'CANCELLED'
}

export enum EventType {
	SMALL = 'SMALL',
	LARGE = 'LARGE'
}

export enum TicketTier {
	BASIC = 'BASIC',
	PREMIUM = 'PREMIUM',
	VIP = 'VIP'
}

export interface IEventBounds {
	start: Date;
	end: Date;
}

export interface IInvite {
	userId?: mongoose.Types.ObjectId;
	email: string;
	status: 'pending' | 'accepted' | 'declined';
	inviteCode: string;
	qrCodeUrl?: string;
	createdAt?: Date;
	updatedAt?: Date;
	respondedByEmail?: string;
}

export interface ITicketSlot {
	tier: TicketTier;
	totalSlots: number;
	availableSlots: number;
	price?: number;
}

export interface IEvent extends Document {
	eventType: EventType;
	organizerId: mongoose.Types.ObjectId;
	name: string;
	description?: string;
	status: EventStatus;
	bounds: IEventBounds;
	locked: boolean;
	createdAt: Date;
	rsvpList?: mongoose.Types.ObjectId[];
	// Properties for both small and large events
	inviteList?: IInvite[];
	ticketSlots?: ITicketSlot[];
}
// NOTE: When updating types, also update the corresponding schema in event.model.ts