export class MapEventDto {
  id!: string;
  eventType!: string;
  locationText!: string | null;
  senderName!: string | null;
  eventTime!: Date | null;
  lat!: number | null;
  lng!: number | null;
  geoSource!: "fallback" | "nominatim" | null;
  rawMessage!: string;
}
