## Image tracing rules (Mode B)

The CLI owns the frame; the model owns the eyes. Phyllum validates the file,
builds the **trace request**, and ingests the **trace result** — the measuring
itself happens where the vision is (a Claude Code session, or the `claude` CLI
the terminal shells out to). Phyllum never guesses a pixel, and never asks a model
to guess one either.

Four steps, in order:

1. **Validate the file.** The argument must resolve to a file that exists, is
   readable, and carries one of `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`,
   `.avif`, `.bmp`, `.svg`. Anything else is an error with the reason named —
   never a silent fall back to prose.
2. **Build the trace request.** One instruction listing exactly what to measure
   (the table below), the archetype contract to fill, and the reply shape. The
   request is text; the image is handed over as a path.
3. **Trace.** The model measures what it can see and reports each measurement
   with a confidence between 0 and 1. A property it cannot see is *omitted* or
   listed under `unmeasurable` — never given a plausible value.
4. **Ingest.** Phyllum turns the result into a draft: measurements at or above the
   property's minimum confidence become draft properties with origin `image`;
   everything else becomes a follow-up question. Ingestion is the anti-fabrication
   gate, so it is deliberately strict — see "What ingestion refuses".

### The trace result shape

```json
{
  "name": "Button/Primary",
  "archetype": "button",
  "measurements": [
    { "property": "background", "value": "#2563EB", "confidence": 0.97 },
    { "property": "radius", "value": "8px", "confidence": 0.91 },
    { "property": "font-weight", "value": "600", "confidence": 0.44, "note": "small sample" }
  ],
  "unmeasurable": ["shadow"]
}
```

### What can be measured, and how sure is sure enough

Every row is a property key from the slot vocabulary above, so a traced
measurement fills a contract slot exactly like a prose one. **Min confidence**
is the bar a measurement must clear to enter the draft; below it the reading
becomes a question that quotes the reading rather than recording it.
**Tolerance** is what the eval holds a trace to against known ground truth.

<!-- phyllum:trace -->

| Property | Measured as | Min confidence | Tolerance |
|----------|-------------|----------------|-----------|
| background | colour | 0.8 | ΔE < 5 |
| text-colour | colour | 0.8 | ΔE < 5 |
| border-colour | colour | 0.8 | ΔE < 5 |
| overlay-colour | colour | 0.8 | ΔE < 5 |
| border-width | length | 0.8 | ±1px |
| radius | length | 0.8 | ±1px |
| radius-top-left | length | 0.8 | ±1px |
| radius-top-right | length | 0.8 | ±1px |
| radius-bottom-right | length | 0.8 | ±1px |
| radius-bottom-left | length | 0.8 | ±1px |
| padding | length | 0.8 | ±1px |
| padding-top | length | 0.8 | ±1px |
| padding-bottom | length | 0.8 | ±1px |
| padding-left | length | 0.8 | ±1px |
| padding-right | length | 0.8 | ±1px |
| gap | length | 0.8 | ±1px |
| font-size | length | 0.8 | ±1px |
| line-height | length | 0.85 | ±1px |
| font-weight | weight | 0.9 | exact |
| shadow | shadow | 0.9 | — |

### What ingestion refuses

- **A property not in that table.** A still image cannot show it, so a claim
  about it is not a measurement. It is dropped, and reported as dropped.
- **A measurement with no value, or no confidence.** An unquantified claim is an
  opinion; opinions do not enter drafts.
- **Anything under `unmeasurable`.** It becomes a follow-up question, never a
  value, however confident the surrounding prose sounds.
- **Every state in the contract.** A still image shows one state. `hover`,
  `focus`, `disabled` and `error` are always follow-up questions in image mode,
  even when the image "obviously" implies them.

A low-confidence reading is still useful as a *suggestion*: the question quotes
it — "the radius reads about 8px, confidence 0.44" — and it is recorded only if
the user picks it. That is the difference between showing your working and
inventing a value.

---
