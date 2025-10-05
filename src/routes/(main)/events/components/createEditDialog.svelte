<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { EventType } from '$lib/models/event.model.types.js';
	import { Plus, X } from 'phosphor-svelte';
	import { generateInviteCode, generateQRCode } from '$lib/utils/invite.js';

	let {
		open = $bindable(false),
		editingEvent = null,
		formData = $bindable(),
		loading = false,
		onSave,
		onCancel
	}: {
		open: boolean;
		editingEvent: any;
		formData: any;
		loading: boolean;
		onSave: () => void;
		onCancel: () => void;
	} = $props();

	let newInviteEmail = $state('');

	async function handleSave() {
		// Ensure all invites have invite codes and QR codes
		if (formData.inviteList) {
			for (let invite of formData.inviteList) {
				if (!invite.inviteCode) {
					invite.inviteCode = generateInviteCode();
					try {
						invite.qrCodeUrl = await generateQRCode(invite.inviteCode);
					} catch (error) {
						console.error('Failed to generate QR code for existing invite:', error);
					}
				}
			}
		}
		onSave();
	}

	function handleCancel() {
		onCancel();
		open = false;
	}

	async function addInvite() {
		if (newInviteEmail.trim() && isValidEmail(newInviteEmail)) {
			if (!formData.inviteList) {
				formData.inviteList = [];
			}

			// Check if email already exists
			const emailExists = formData.inviteList.some(
				(invite: any) => invite.email === newInviteEmail.trim()
			);
			if (!emailExists) {
				const inviteCode = generateInviteCode();
				let qrCodeUrl = '';

				try {
					// Generate QR code for the invite
					qrCodeUrl = await generateQRCode(inviteCode);
				} catch (error) {
					console.error('Failed to generate QR code:', error);
				}

				formData.inviteList.push({
					email: newInviteEmail.trim(),
					status: 'pending',
					inviteCode,
					qrCodeUrl,
					createdAt: new Date()
				});
				newInviteEmail = '';
			}
		}
	}

	function removeInvite(index: number) {
		formData.inviteList.splice(index, 1);
		formData.inviteList = formData.inviteList; // Trigger reactivity
	}

	function isValidEmail(email: string): boolean {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(email);
	}

	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			addInvite();
		}
	}
</script>

<style>
	:global([data-slot="dialog-overlay"]) {
		z-index: 9998 !important;
	}
	
	:global([data-slot="dialog-content"]) {
		z-index: 9999 !important;
	}
</style>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-[600px]">
		<Dialog.Header>
			<Dialog.Title>
				{editingEvent ? 'Edit Event' : 'Create New Event'}
			</Dialog.Title>
			<Dialog.Description>
				{editingEvent
					? 'Update the event details below.'
					: 'Fill in the details to create a new event.'}
			</Dialog.Description>
		</Dialog.Header>

		<div class="grid grid-cols-1 gap-4 py-4 md:grid-cols-2">
			<div>
				<Label for="eventType">Event Type</Label>
				<select
					bind:value={formData.eventType}
					class="border-border w-full rounded-md border p-2"
					disabled={editingEvent}
				>
					<option value={EventType.SMALL}>Small Event</option>
					<option value={EventType.LARGE}>Large Event</option>
				</select>
			</div>

			<div>
				<Label for="name">Event Name</Label>
				<Input bind:value={formData.name} placeholder="Enter event name" required />
			</div>

			<div class="md:col-span-2">
				<Label for="description">Description</Label>
				<textarea
					bind:value={formData.description}
					placeholder="Enter event description"
					class="border-border bg-background text-foreground h-24 w-full resize-none rounded-md border p-2"
				></textarea>
			</div>

			<div>
				<Label for="start">Start Date & Time</Label>
				<Input type="datetime-local" bind:value={formData.bounds.start} required />
			</div>

			<div>
				<Label for="end">End Date & Time</Label>
				<Input type="datetime-local" bind:value={formData.bounds.end} required />
			</div>

			{#if formData.eventType === EventType.SMALL}
				<div class="md:col-span-2">
					<Label for="invites">Invite List</Label>
					<div class="space-y-2">
						<div class="flex gap-2">
							<Input
								bind:value={newInviteEmail}
								placeholder="Enter email address"
								type="email"
								onkeypress={handleKeyPress}
								class="flex-1"
							/>
							<Button
								type="button"
								onclick={addInvite}
								disabled={!newInviteEmail.trim() || !isValidEmail(newInviteEmail)}
								size="sm"
								class="flex items-center gap-1"
							>
								<Plus size={14} />
								Add
							</Button>
						</div>

						{#if formData.inviteList && formData.inviteList.length > 0}
							<div class="max-h-64 space-y-2 overflow-y-auto">
								{#each formData.inviteList as invite, index (invite.email)}
									<div class="border-border space-y-2 rounded-lg border p-3">
										<div class="flex items-center justify-between">
											<span class="text-sm font-medium">{invite.email}</span>
											<Button
												type="button"
												onclick={() => removeInvite(index)}
												size="sm"
												variant="ghost"
												class="text-destructive hover:text-destructive h-6 w-6 p-0"
											>
												<X size={12} />
											</Button>
										</div>

										{#if invite.qrCodeUrl}
											<div class="flex items-start gap-3">
												<div class="flex-shrink-0">
													<img
														src={invite.qrCodeUrl}
														alt="QR Code for {invite.email}"
														class="border-border h-16 w-16 rounded border"
													/>
												</div>
												<div class="min-w-0 flex-1">
													<p class="text-muted-foreground mb-1 text-xs">Invite Link:</p>
													<code class="bg-muted rounded p-1 text-xs break-all">
														{window.location.origin}/rsvp/{invite.inviteCode}
													</code>
												</div>
											</div>
										{/if}
									</div>
								{/each}
							</div>
							<p class="text-muted-foreground text-xs">
								{formData.inviteList.length} invite{formData.inviteList.length !== 1 ? 's' : ''} added
							</p>
						{/if}
					</div>
				</div>
			{/if}
		</div>	

		<Dialog.Footer>
			<div class="flex justify-end gap-2">
				<Button variant="outline" onclick={handleCancel}>Cancel</Button>
				<Button
					onclick={handleSave}
					disabled={loading || !formData.name || !formData.bounds.start || !formData.bounds.end}
				>
					{loading ? 'Saving...' : editingEvent ? 'Update Event' : 'Create Event'}
				</Button>
			</div>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
