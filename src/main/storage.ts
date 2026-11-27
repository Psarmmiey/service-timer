import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type JsonStore = {
  read<T>(filename: string, fallback: T): T;
  write<T>(filename: string, value: T): void;
};

export function createJsonStore(directory: string): JsonStore {
  mkdirSync(directory, { recursive: true });
  return {
    read<T>(filename: string, fallback: T): T {
      try {
        return JSON.parse(readFileSync(join(directory, filename), "utf8")) as T;
      } catch {
        return fallback;
      }
    },
    write<T>(filename: string, value: T): void {
      const target = join(directory, filename);
      mkdirSync(dirname(target), { recursive: true });
      const temporary = `${target}.${process.pid}.tmp`;
      writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
      renameSync(temporary, target);
    },
  };
}
