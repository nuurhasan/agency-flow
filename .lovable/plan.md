

Account exists (`be698888-726b-42e7-8bce-233432d26f6f`). I can't reset auth passwords from the read-only plan mode, but I can do it once you approve.

## Plan

Run a one-off admin script using the service role key to call `supabase.auth.admin.updateUserById()` and set the password to `12345678` for `nuur.hasan@gloria9.com`.

```ts
// /tmp/reset-pw.ts
import { createClient } from "@supabase/supabase-js";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
await admin.auth.admin.updateUserById(
  "be698888-726b-42e7-8bce-233432d26f6f",
  { password: "12345678" }
);
```

No code changes, no migrations, nothing committed to the repo. Just an ephemeral script to update the password, then I'll confirm you can sign in.

**After this works, please change it to a stronger password from Settings.**

