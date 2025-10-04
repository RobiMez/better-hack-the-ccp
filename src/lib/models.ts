// Central model registration file
// Import all models to ensure they are registered with Mongoose
import { connectDB } from './db.js';

// Import all model files to register them
import './models/better-auth/user.model.js';
import './models/better-auth/account.model.js';
import './models/better-auth/session.model.js';
import './models/event.model.js';

// Re-export models for convenience
export { User } from './models/better-auth/user.model.js';
export { Account } from './models/better-auth/account.model.js';
export { Session } from './models/better-auth/session.model.js';
export { Event } from './models/event.model.js';

// Initialize database connection and ensure models are registered
export async function initializeModels() {
	try {
		await connectDB();
		console.log('✅ All models registered and database connected');
	} catch (error) {
		console.error('❌ Failed to initialize models:', error);
		throw error;
	}
}

// Auto-initialize when this module is imported
initializeModels().catch(console.error);
