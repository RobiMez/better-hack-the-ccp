<script lang="ts" module>
	const data = {
		user: {
			name: 'shadcn',
			email: 'm@example.com',
			avatar: '/android-chrome-192x192.png'
		},
		navMain: [
			{
				title: 'Home',
				url: '/home',
				icon: House,
				isActive: true
			},
			{
				title: 'Events & Invites',
				url: '/events',
				icon: CalendarStar,
				isActive: true
			},
			{
				title: 'Votes',
				url: '/votes',
				icon: BoxArrowDown
			},
			{
				title: 'Settings',
				url: 'settings',
				icon: GearSix
			}
		]
	};
</script>

<script lang="ts">
	import NavMain from './nav-main.svelte';

	import NavUser from './nav-user.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import CommandIcon from '@lucide/svelte/icons/command';
	import type { ComponentProps } from 'svelte';
	import { BoxArrowDown, CalendarStar, GearSix, House, Ticket } from 'phosphor-svelte';

	let { ref = $bindable(null), ...restProps }: ComponentProps<typeof Sidebar.Root> = $props();
</script>

<Sidebar.Root bind:ref variant="inset" {...restProps}>
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg">
					{#snippet child({ props })}
						<a href="##" {...props}>
							<div
								class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg"
							>
								<CommandIcon class="size-4" />
							</div>
							<div class="grid flex-1 text-left text-sm leading-tight">
								<span class="truncate font-medium">Acme Inc</span>
								<span class="truncate text-xs">Enterprise</span>
							</div>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>
	<Sidebar.Content>
		<NavMain items={data.navMain} />
	</Sidebar.Content>
	<Sidebar.Footer>
		<NavUser user={data.user} />
	</Sidebar.Footer>
</Sidebar.Root>
