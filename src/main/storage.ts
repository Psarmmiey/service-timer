import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
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
      try {
        renameSync(temporary, target);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EEXIST" && code !== "EPERM") throw error;
        unlinkSync(target);
        renameSync(temporary, target);
      }
    },
  };
}
