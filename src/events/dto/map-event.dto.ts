export class MapEventDto {
  id!: string;
  eventType!: string;
  locationText!: string | null;
  senderName!: string | null;
  description!: string | null;
  confidence!: number;
  eventTime!: Date | null;
  createdAt!: Date;
  expiresAt!: Date;
  lat!: number | null;
  lng!: number | null;
  geoSource!:
    | "fallback"
    | "nominatim"
    | "cache"
    | "google"
    | "google_partial"
    | null;
  upvotes!: number;
  downvotes!: number;
  rawMessage?: string;
}
