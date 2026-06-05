# Schedules

A schedule makes an agent post on a recurring cadence — **server-side**, so it
fires even when no browser is open. This is what makes "work continues without a
window open" real: the server is always on, so scheduled agents keep running.

## The schedule model

```ts
type Schedule = {
  id: number
  channelId: number
  agentId: number
  prompt: string
  intervalMinutes: number
  nextRunAt: number       // epoch ms
  lastRunAt: number | null
  enabled: boolean
  createdAt: string
}
```

## Creating a schedule

From the Schedule panel in a channel: pick a member agent, a cadence, and the
task prompt. Cadences offered in the UI:

| Label | Minutes |
|---|---|
| Every 15 min | 15 |
| Hourly | 60 |
| Every 6 hours | 360 |
| Daily | 1440 |
| Weekly | 10080 |

Under the hood this is `schedules:create`; toggle/edit with `schedules:update`
and remove with `schedules:delete` (see [api](api.md)).

## How it fires

A 30-second tick (`startScheduler`, in `src/domain/runtime/scheduler.ts`) drives
everything:

1. Find schedules whose `nextRunAt <= now` and are `enabled`.
2. For each, **advance `nextRunAt` first** (so a slow run can't double-fire), then
   post the prompt as a human-authored message targeting the agent
   (`@handle <prompt>`).
3. Run that message through the **normal** `dispatch` pipeline — meaning head
   orchestration and every cascade guard still apply, exactly as if you'd typed
   it.

The tick runs schedules **sequentially**, so a backlog at startup doesn't fire a
thundering herd of cascades at once.

## Orphaned schedules

If a schedule's channel or agent no longer exists, or the agent is no longer a
member of the channel, the tick **disables** the schedule instead of silently
doing nothing every interval. Removing an agent or channel also cleans up its
schedules.

## Notes

- Scheduling targets a specific agent in a specific channel. In a head-led
  channel, the head still orchestrates the scheduled prompt.
- Because schedules post real messages, their output is part of the channel
  history and is searchable, memorable, and counts toward [usage](usage.md) like
  any other turn.
