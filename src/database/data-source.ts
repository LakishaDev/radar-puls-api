import "reflect-metadata";
import { DataSource } from "typeorm";
import { RawEventEntity } from "./raw-event.entity";

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  entities: [RawEventEntity],
  migrations: ["src/database/migrations/*.ts", "dist/database/migrations/*.js"],
  synchronize: false,
});
