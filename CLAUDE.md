# Claude Code — project notes

## Change log (mandatory)

After **every** code change in this repository, append an entry to **`DEVLOG.md`** at the project root.

Each entry must include:

- **Sequence number** — `SEQ-001`, `SEQ-002`, … (increment; never skip; one entry per logical change)
- **Timestamp** — `YYYY-MM-DD HH:mm` (use the time when the change is finished)
- **Files** — paths relative to repo root
- **Action** — one-line summary
- **Details** — what was implemented or fixed
- **Reason** — context (feature request, bug, refactor, etc.)

Use this block format (match existing entries in `DEVLOG.md`):

```markdown
---
### [SEQ-NNN] YYYY-MM-DD HH:mm
**Files:** …
**Action:** …
**Details:** …
**Reason:** …
---
```

Read the latest `### [SEQ-...]` in `DEVLOG.md` and use **the next** sequence number.

Cursor-specific rules also live in **`.cursorrules`**; keep `DEVLOG.md` consistent whether edits come from Claude or Cursor.
