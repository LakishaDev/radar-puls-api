import { Global, Module } from "@nestjs/common";
import { RealtimePublisher } from "./realtime.publisher";

@Global()
@Module({
  providers: [RealtimePublisher],
  exports: [RealtimePublisher],
})
export class RealtimeModule {}
