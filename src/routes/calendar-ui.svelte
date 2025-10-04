<script lang="ts">
  import { onMount } from 'svelte';

  export let busyTimes: { start: string; end: string }[] = [];

  const days = ['Thu 2', 'Fri 3', 'Sat 4', 'Sun 5', 'Mon 6', 'Tue 7', 'Wed 8'];
  const hours = Array.from({ length: 24 }, (_, i) => i); // 0–23 UTC

  function timeToTop(hour: number, minute: number) {
    return (hour + minute / 60) * 60; // 60px per hour
  }

  function parseBusyBlock(block: { start: string; end: string }) {
    const start = new Date(block.start);
    const end = new Date(block.end);
    const dayIndex = start.getUTCDay() - 4; // Thu=0, Fri=1, Sat=2...
    const top = timeToTop(start.getUTCHours(), start.getUTCMinutes());
    const height = (end.getTime() - start.getTime()) / (1000 * 60) * 1; // 1px per min
    return { dayIndex, top, height, start, end };
  }

  let blocks: any = [];

  onMount(() => {
    blocks = busyTimes.map(parseBusyBlock);
  });
</script>

<style>
  .calendar {
    display: grid;
    grid-template-columns: 50px repeat(7, 1fr);
    border: 1px solid #444;
    font-family: sans-serif;
    position: relative;
  }
  .hour-label {
    border-bottom: 1px solid #333;
    height: 60px;
    padding: 2px 5px;
    font-size: 12px;
    color: #ccc;
  }
  .day-header {
    background: #222;
    color: #fff;
    text-align: center;
    padding: 4px;
    border-bottom: 1px solid #333;
  }
  .cell {
    border-bottom: 1px solid #333;
    border-right: 1px solid #333;
    height: 60px;
    position: relative;
  }
  .busy-block {
    position: absolute;
    left: 0;
    right: 0;
    background-color: #2a6f4b;
    color: white;
    font-size: 10px;
    padding: 2px;
    border-radius: 3px;
    overflow: hidden;
  }
</style>

<div class="calendar">
  <!-- Empty top-left corner -->
  <div></div>
  {#each days as day}
    <div class="day-header">{day}</div>
  {/each}

  <!-- Hour labels + cells -->
  {#each hours as hour}
    <div class="hour-label">{hour}:00</div>
    {#each days as _, dayIndex}
      <div class="cell"></div>
    {/each}
  {/each}

  <!-- Busy blocks -->
  {#each blocks as block}
    <div
      class="busy-block"
      style="
        grid-column: {block.dayIndex + 2};
        top: {block.top}px;
        height: {block.height}px;
      "
      title="{block.start.toUTCString()} → {block.end.toUTCString()}"
    >
      Busy
    </div>
  {/each}
</div>
