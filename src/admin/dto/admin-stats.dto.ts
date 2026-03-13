export class AdminStatsDto {
  total_raw_events!: number;
  total_parsed!: number;
  total_enriched!: number;
  total_failed!: number;
  pending_review!: number;
  approved!: number;
  rejected!: number;
  events_last_24h!: number;
  events_last_7d!: number;
  top_event_types!: Array<{ type: string; count: number }>;
  enrichment_success_rate!: number;
}
