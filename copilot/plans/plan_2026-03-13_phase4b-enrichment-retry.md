# Plan — Phase 4b: Enrichment Retry Policy

Date: 2026-03-13  
Status: READY FOR IMPLEMENTATION

## Goal

Dodati bounded retry mehanizam za `enrich_status='failed'` zapise. Poller automatski re-pokušava enrichment posle eksponencijalnog cooldown perioda, ali samo do konfigurabilnog maksimalnog broja pokušaja. Posle iscrpljivanja pokušaja zapis ostaje trajno `failed`.

## Locked Decisions

- **Retry Tracking**: Dva nova DB polja — `enrich_attempts INT NOT NULL DEFAULT 0` i `enrich_next_retry_at TIMESTAMPTZ NULL`
- **Retry Selection**: Poller uzima `pending` gde je `enrich_next_retry_at IS NULL OR enrich_next_retry_at <= NOW()`
- **Failure Path**: Na grešku: inkrement `enrich_attempts`; ako `< max` → vrati na `pending` sa novim `enrich_next_retry_at`; ako `>= max` → trajno `failed`
- **Cooldown Formula**: Eksponencijalni backoff: `min(retryBaseMs * 2^(newAttempts - 1), 3_600_000)` (cap na 1h)
- **Default Max Attempts**: `3` — konfigurabilan putem `ENRICHMENT_MAX_ATTEMPTS`
- **Default Base Cooldown**: `60_000ms` — konfigurabilan putem `ENRICHMENT_RETRY_COOLDOWN_MS`
- **Success Path**: Ne menja `enrich_attempts` — samo failure path ga inkrementuje
- **No Manual Retry Endpoint**: Van scope-a za sada
- **Backfill Compatibility**: Backfill već postavlja `enrich_status='pending'` — kompatibilan bez izmena jer novi zapisi imaju `enrich_attempts=0 DEFAULT` i `enrich_next_retry_at=NULL`

---

## DB Schema

### Nova migracija: `1710380000000-AddRetryFieldsToParsedEvents.ts`

```sql
-- up
ALTER TABLE parsed_events
  ADD COLUMN IF NOT EXISTS enrich_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enrich_next_retry_at TIMESTAMPTZ NULL;

-- down
ALTER TABLE parsed_events
  DROP COLUMN IF EXISTS enrich_next_retry_at,
  DROP COLUMN IF EXISTS enrich_attempts;
```

---

## Commit Plan

### COMMIT 1 — DB migracija i entity

**Kreirati**: `src/database/migrations/1710380000000-AddRetryFieldsToParsedEvents.ts`

```typescript
import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRetryFieldsToParsedEvents1710380000000
  implements MigrationInterface
{
  name = "AddRetryFieldsToParsedEvents1710380000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE parsed_events ADD COLUMN IF NOT EXISTS enrich_attempts INT NOT NULL DEFAULT 0;",
    );
    await queryRunner.query(
      "ALTER TABLE parsed_events ADD COLUMN IF NOT EXISTS enrich_next_retry_at TIMESTAMPTZ NULL;",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE parsed_events DROP COLUMN IF EXISTS enrich_next_retry_at;",
    );
    await queryRunner.query(
      "ALTER TABLE parsed_events DROP COLUMN IF EXISTS enrich_attempts;",
    );
  }
}
```

**Izmeniti**: `src/database/parsed-event.entity.ts` — dodati 2 polja posle `enrichedAt`:

```typescript
@Column({ type: "int", name: "enrich_attempts", default: 0 })
enrichAttempts!: number;

@Column({ type: "timestamptz", name: "enrich_next_retry_at", nullable: true })
enrichNextRetryAt!: Date | null;
```

---

### COMMIT 2 — EnrichmentService

**Izmeniti**: `src/enrichment/enrichment.service.ts`

#### 2a — Proširiti `PendingEnrichmentRecord` tip

```typescript
// STARO:
type PendingEnrichmentRecord = {
  id: string;
  rawEventId: string;
  rawMessage: string;
};

// NOVO:
type PendingEnrichmentRecord = {
  id: string;
  rawEventId: string;
  rawMessage: string;
  enrichAttempts: number;
};
```

#### 2b — Proširiti private fields i konstruktor

Dodati u deklaracije klase (pored ostalih private readonly polja):
```typescript
private readonly maxAttempts: number;
private readonly retryBaseMs: number;
```

Dodati na kraj konstruktora:
```typescript
this.maxAttempts = this.getPositiveInt("ENRICHMENT_MAX_ATTEMPTS", 3);
this.retryBaseMs = this.getPositiveInt("ENRICHMENT_RETRY_COOLDOWN_MS", 60_000);
```

#### 2c — Ažurirati `findPending` metodu

Stari SQL:
```sql
SELECT pe.id, pe.raw_event_id, re.raw_message
FROM parsed_events pe
INNER JOIN raw_events re ON re.id = pe.raw_event_id
WHERE pe.enrich_status = 'pending'
ORDER BY pe.created_at ASC
LIMIT $1
```

Novi SQL:
```sql
SELECT pe.id, pe.raw_event_id, re.raw_message, pe.enrich_attempts
FROM parsed_events pe
INNER JOIN raw_events re ON re.id = pe.raw_event_id
WHERE pe.enrich_status = 'pending'
  AND (pe.enrich_next_retry_at IS NULL OR pe.enrich_next_retry_at <= NOW())
ORDER BY pe.created_at ASC
LIMIT $1
```

Ažurirati tip i row mapping:
```typescript
const rows = (await this.parsedEventsRepository.query(...)) as Array<{
  id: string;
  raw_event_id: string;
  raw_message: string;
  enrich_attempts: number;   // NOVO
}>;

return rows.map((row) => ({
  id: row.id,
  rawEventId: row.raw_event_id,
  rawMessage: row.raw_message,
  enrichAttempts: row.enrich_attempts,   // NOVO
}));
```

#### 2d — Zameniti catch blok u `enrichEvent`

```typescript
// STARO catch blok:
} catch (error) {
  await this.parsedEventsRepository.query(
    `UPDATE parsed_events
     SET enrich_status = 'failed', updated_at = NOW()
     WHERE id = $1`,
    [event.id],
  );

  this.logger.error("enrichment_failed", {
    parsed_event_id: event.id,
    raw_event_id: event.rawEventId,
    error: error instanceof Error ? error.message : "unknown enrichment error",
  });

  return false;
}

// NOVO catch blok:
} catch (error) {
  const newAttempts = event.enrichAttempts + 1;
  const exhausted = newAttempts >= this.maxAttempts;

  if (exhausted) {
    await this.parsedEventsRepository.query(
      `UPDATE parsed_events
       SET enrich_status = 'failed',
           enrich_attempts = $2,
           enrich_next_retry_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [event.id, newAttempts],
    );
  } else {
    const delayMs = Math.min(
      this.retryBaseMs * Math.pow(2, newAttempts - 1),
      3_600_000,
    );
    const retryAt = new Date(Date.now() + delayMs);
    await this.parsedEventsRepository.query(
      `UPDATE parsed_events
       SET enrich_status = 'pending',
           enrich_attempts = $2,
           enrich_next_retry_at = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [event.id, newAttempts, retryAt],
    );
  }

  this.logger.error("enrichment_failed", {
    parsed_event_id: event.id,
    raw_event_id: event.rawEventId,
    attempt: newAttempts,
    exhausted,
    error: error instanceof Error ? error.message : "unknown enrichment error",
  });

  return false;
}
```

---

### COMMIT 3 — Env validacija i .env.example

**Izmeniti**: `src/config/env.validation.ts` — dodati na kraj `EnvironmentVariables` klase (pored ostalih `ENRICHMENT_*` polja):

```typescript
@IsOptional()
@IsInt()
@Min(1)
ENRICHMENT_MAX_ATTEMPTS?: number;

@IsOptional()
@IsInt()
@Min(1000)
ENRICHMENT_RETRY_COOLDOWN_MS?: number;
```

**Izmeniti**: `.env.example` — dodati pored ostalih enrichment varijabli:

```
ENRICHMENT_MAX_ATTEMPTS=3
ENRICHMENT_RETRY_COOLDOWN_MS=60000
```

---

### COMMIT 4 — Testovi

**Izmeniti**: `test/enrichment.e2e-spec.ts`

#### Priprema: proširiti `configValues`

Dodati u `configValues` objekat:
```typescript
ENRICHMENT_MAX_ATTEMPTS: "3",
ENRICHMENT_RETRY_COOLDOWN_MS: "60000",
```

#### Ažurirati postojeće testove koji mockuju `findPending`

Svi postojeći pozivi `mockResolvedValueOnce([{ id, raw_event_id, raw_message }])` moraju dobiti i `enrich_attempts: 0`:
```typescript
// STARO:
{ id: "parsed-1", raw_event_id: "raw-1", raw_message: "..." }

// NOVO:
{ id: "parsed-1", raw_event_id: "raw-1", raw_message: "...", enrich_attempts: 0 }
```

#### Test 1: Retry zakazan posle prve greške

```typescript
it("schedules retry after first failure", async () => {
  const before = Date.now();

  repositoryMock.query
    .mockResolvedValueOnce([
      { id: "p-1", raw_event_id: "r-1", raw_message: "neka poruka", enrich_attempts: 0 },
    ])
    .mockResolvedValueOnce([[], 1]);

  jest
    .spyOn(enrichmentService as any, "extractStructuredData")
    .mockRejectedValue(new Error("openai down"));

  const result = await enrichmentService.pollAndEnrich(10);

  expect(result.failedCount).toBe(1);

  const updateCall = (repositoryMock.query as jest.Mock).mock.calls[1];
  const params = updateCall[1] as [string, number, Date];

  // id
  expect(params[0]).toBe("p-1");
  // attempts inkrementirani na 1
  expect(params[1]).toBe(1);
  // retry in future
  expect(params[2]).toBeInstanceOf(Date);
  expect(params[2].getTime()).toBeGreaterThan(before);
});
```

#### Test 2: Drugi pokušaj ima duži cooldown (eksponencijalni backoff)

```typescript
it("schedules longer cooldown on second failure (exponential backoff)", async () => {
  repositoryMock.query
    .mockResolvedValueOnce([
      { id: "p-2", raw_event_id: "r-2", raw_message: "neka poruka", enrich_attempts: 1 },
    ])
    .mockResolvedValueOnce([[], 1]);

  jest
    .spyOn(enrichmentService as any, "extractStructuredData")
    .mockRejectedValue(new Error("openai down"));

  const before = Date.now();
  await enrichmentService.pollAndEnrich(10);

  const params = (repositoryMock.query as jest.Mock).mock.calls[1][1] as [string, number, Date];
  expect(params[1]).toBe(2);
  // base=60000, attempt=2 → delay = 60000 * 2^1 = 120000ms
  expect(params[2].getTime()).toBeGreaterThanOrEqual(before + 100_000);
});
```

#### Test 3: Trajno failed posle maxAttempts

```typescript
it("permanently fails record after maxAttempts exhausted", async () => {
  // maxAttempts=3, enrich_attempts=2 → ovo je treći i poslednji pokušaj
  repositoryMock.query
    .mockResolvedValueOnce([
      { id: "p-3", raw_event_id: "r-3", raw_message: "neka poruka", enrich_attempts: 2 },
    ])
    .mockResolvedValueOnce([[], 1]);

  jest
    .spyOn(enrichmentService as any, "extractStructuredData")
    .mockRejectedValue(new Error("openai down"));

  await enrichmentService.pollAndEnrich(10);

  const updateSql = (repositoryMock.query as jest.Mock).mock.calls[1][0] as string;
  const params = (repositoryMock.query as jest.Mock).mock.calls[1][1] as unknown[];

  // SQL mora da postavi 'failed', ne 'pending'
  expect(updateSql).toContain("enrich_status = 'failed'");
  // params: [id, attempts, null] — nema Date za retry
  expect(params[0]).toBe("p-3");
  expect(params[1]).toBe(3);
  expect(params[2]).toBeNull();
});
```

#### Test 4: Uspešan enrichment posle retry-a (enrich_attempts > 0)

```typescript
it("enriches successfully on retry attempt", async () => {
  repositoryMock.query
    .mockResolvedValueOnce([
      { id: "p-4", raw_event_id: "r-4", raw_message: "Petar bulevar", enrich_attempts: 1 },
    ])
    .mockResolvedValueOnce([[], 1]);

  jest
    .spyOn(enrichmentService as any, "extractStructuredData")
    .mockResolvedValue({ senderName: "Petar", locationText: "Bulevar Nemanjica", eventType: "radar" });
  geocodingServiceMock.geocodeLocation.mockResolvedValueOnce(null);

  const result = await enrichmentService.pollAndEnrich(10);

  expect(result.enrichedCount).toBe(1);
  expect(result.failedCount).toBe(0);
});
```

#### Test 5: findPending SQL uključuje uslov za enrich_next_retry_at

```typescript
it("findPending query filters by enrich_next_retry_at", async () => {
  repositoryMock.query.mockResolvedValueOnce([]);

  await enrichmentService.pollAndEnrich(10);

  const sql = (repositoryMock.query as jest.Mock).mock.calls[0][0] as string;
  expect(sql).toContain("enrich_next_retry_at");
});
```

---

## Files Overview

| Fajl | Akcija |
|---|---|
| `src/database/migrations/1710380000000-AddRetryFieldsToParsedEvents.ts` | **CREATE** |
| `src/database/parsed-event.entity.ts` | edit — +2 kolone |
| `src/enrichment/enrichment.service.ts` | edit — tip, konstruktor, `findPending`, `enrichEvent` catch |
| `src/config/env.validation.ts` | edit — +2 env var deklaracije |
| `.env.example` | edit — +2 env var primeri |
| `test/enrichment.e2e-spec.ts` | edit — ažurirati postojeće mockove, +5 test case-ova |

---

## Verification Checklist

1. `npm run build` — kompajlira bez grešaka
2. `npm run test:e2e` — svih 30 (postojećih) + 5 (novih) = **35 testova prolaze**
3. Ručna provera: jedino mesto gde se setuje `enrich_status = 'failed'` je `exhausted` grana u catch bloku — nema direktnog SET 'failed' bez provere broja pokušaja
4. Ručna provera: `findPending` SQL contains `enrich_next_retry_at`
5. `npm run migration:run` — nova migracija bez grešaka (ako je DB dostupna)
