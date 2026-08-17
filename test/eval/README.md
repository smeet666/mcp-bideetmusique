# Evals

Three tiers of test live in this repo, and mixing them is what makes a suite
untrustworthy.

| Tier       | Where       | Data                            | Runs in                      |
| ---------- | ----------- | ------------------------------- | ---------------------------- |
| Unit       | `test/unit` | built inline, fixed             | `npm test`, on every change  |
| Live smoke | `test/live` | the site, one request per route | `npm run test:live`, nightly |
| Eval       | `test/eval` | the site, records nobody chose  | `npm run test:eval`, nightly |

## What an eval is here

An eval reads records the site serves today and checks **properties**, never
expected values. Nothing is known in advance about a record drawn at random, so
there is nothing to compare it to; what can be stated is that whichever record
comes up, its transcription carries no markup, no undecoded entity, none of the
credit line closing the cell, and none of the notice printed in the row under
it.

Those properties live in `test/invariants/song.ts`. The unit suite applies them
twice: to records it writes by hand, one of which breaks each property, so the
checker is known to fire; and to records the reader produced from built pages,
so the reader is held to them too. The evals then apply the same properties to
pages the site serves. One definition, three uses, and a property that drifts in
one place fails in the others.

## Why an eval does not go red on its own

A run reads a site run by volunteers, and a site can be down. The two outcomes
are told apart rather than merged:

- `network_error`, `timeout` and `rate_limited` say the site could not be read.
  The run reports that and stops, because it learned nothing about the code.
- `parse_failure` and any broken property say the reader is wrong about the
  site. The run fails.

That distinction is the whole reason an eval can be expected to stay green: a
green run means every record read satisfied every property, and a run that read
nothing says so instead of claiming success.

## Running one

```
BIDE_EVAL=1 npm run test:eval
```

`BIDE_EVAL_DRAWS` sets how many records are read, defaulting to 5. Each draw
costs the site one request, paced like every other, so keep it small.
