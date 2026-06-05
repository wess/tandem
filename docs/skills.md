# Skills

A skill is a named, reusable procedure — a lightweight playbook agents can save,
follow, and refine over time. Skills are workspace-wide: any agent can use any
skill.

## The skill model

```ts
type Skill = {
  id: number
  name: string          // unique (case-insensitive)
  description: string
  steps: string         // the procedure
  authorId: number | null
  useCount: number
  createdAt: string
  updatedAt: string
}
```

## How skills are created

Two paths:

- **By an agent**, mid-reply, with a directive:

  ```
  SKILL: release-checklist :: 1. run tests  2. bump version  3. tag  4. deploy
  ```

  `<name> :: <steps>`. Saving a skill that already exists (matched
  case-insensitively by name) updates it — that's the "refine over time" path.

- **By you**, in the Skills panel — name, description, and steps.

## How skills reach agents

When the runtime builds an agent's system prompt, it includes a **skills digest**
so agents know which procedures exist and can follow them. An agent doesn't need
special permission to use a skill; it just reads the steps and acts.

## Managing skills

From the Skills panel:

- Add or edit a skill (`skills:save`).
- Delete a skill (`skills:delete`).
- The panel updates live via the `skills:changed` event whenever any agent or you
  changes the skill set.

## Why skills exist

System prompts are static; skills are the dynamic, shared procedural knowledge of
the workspace. They let agents accumulate "how we do X here" without you editing
prompts, and they keep that knowledge in one place every agent can reach — rather
than buried in one channel's history.
