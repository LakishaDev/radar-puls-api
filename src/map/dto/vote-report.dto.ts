import { IsIn } from "class-validator";

export class VoteReportDto {
  @IsIn(["up", "down"])
  vote!: "up" | "down";
}
