import { Injectable } from "@nestjs/common";
import { Observable, Subject } from "rxjs";

export type RealtimeEventType =
  | "new_report"
  | "report_updated"
  | "report_removed";

export type RealtimeEvent = {
  type: RealtimeEventType;
  reportId: string;
  payload?: unknown;
};

@Injectable()
export class RealtimePublisher {
  private readonly eventSubject = new Subject<RealtimeEvent>();

  get events$(): Observable<RealtimeEvent> {
    return this.eventSubject.asObservable();
  }

  publish(event: RealtimeEvent): void {
    this.eventSubject.next(event);
  }
}
