import "reflect-metadata";
import { DataSource } from "typeorm";
import { RawEventEntity } from "./raw-event.entity";
import { ParsedEventEntity } from "./parsed-event.entity";

const migrationGlob = __filename.endsWith(".ts")
  ? "src/database/migrations/*.ts"
  : "dist/database/migrations/*.js";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  entities: [RawEventEntity, ParsedEventEntity],
  migrations: [migrationGlob],
  synchronize: false,
});
